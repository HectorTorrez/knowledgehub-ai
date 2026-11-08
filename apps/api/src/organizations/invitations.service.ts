import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AcceptInvitationResponse,
  EmailLocale,
  CreateInvitationResponse,
  InvitationListResponse,
  InvitationPreviewResponse,
  OrganizationInvitationSummary,
  OrganizationRole,
} from '@knowledgehub/shared-types';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  AuthService,
  type AuthOptions,
  type AuthResult,
} from '../auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.port.js';
import { invitationEmail } from '../email/templates.js';
import { canManageRole } from './permissions.js';
import { requireCapability } from './require-owner.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import type { AcceptInvitationWithNewAccountInput } from './dto/accept-invitation.schema.js';
import type { OrganizationContext } from './organization-context.js';

const INVITATION_TOKEN_BYTES = 32;
const MS_PER_DAY = 86_400_000;

interface InvitationProjection {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: Date;
  createdAt: Date;
}

interface PendingInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
}

function invalidInvitation(): NotFoundException {
  return new NotFoundException('Invitation is not valid');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toInvitationSummary(
  invitation: InvitationProjection,
): OrganizationInvitationSummary {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly auth: AuthService,
  ) {}

  async create(
    context: OrganizationContext,
    email: string,
    role: OrganizationRole = 'MEMBER',
    locale: EmailLocale = 'en',
  ): Promise<CreateInvitationResponse> {
    const actorRole = await this.assertManager(context);

    if (!canManageRole(actorRole, role))
      throw new ForbiddenException('Cannot grant this role');
    const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: context.organizationId,
        email: normalizeEmail(email),
        role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    await this.activity.record(this.prisma, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'INVITATION_CREATED',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    const emailDelivered = await this.sendInvitationEmail(
      context,
      invitation,
      token,
      locale,
    );

    return {
      emailDelivered,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      },
    };
  }

  async list(context: OrganizationContext): Promise<InvitationListResponse> {
    await this.assertManager(context);

    const invitations = await this.prisma.organizationInvitation.findMany({
      where: {
        organizationId: context.organizationId,
        acceptedAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return { invitations: invitations.map(toInvitationSummary) };
  }

  async revoke(
    context: OrganizationContext,
    invitationId: string,
  ): Promise<void> {
    const actorRole = await this.assertManager(context);

    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId: context.organizationId },
      select: { email: true, role: true },
    });
    if (invitation && !canManageRole(actorRole, invitation.role))
      throw new ForbiddenException('Cannot manage this role');
    const result = await this.prisma.organizationInvitation.deleteMany({
      where: { id: invitationId, organizationId: context.organizationId },
    });

    if (result.count === 0 || !invitation) {
      throw new NotFoundException('Invitation not found');
    }
    await this.activity.record(this.prisma, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: 'INVITATION_REVOKED',
      targetType: 'invitation',
      targetId: invitationId,
      metadata: { email: invitation.email },
    });
  }

  async preview(token: string): Promise<InvitationPreviewResponse> {
    const invitation = await this.findPending(token);
    const [organization, account] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: invitation.organizationId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      }),
    ]);

    return {
      email: invitation.email,
      role: invitation.role,
      organizationName: organization.name,
      accountExists: account !== null,
    };
  }

  async accept(
    userId: string,
    token: string,
  ): Promise<AcceptInvitationResponse> {
    const invitation = await this.findPending(token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });

    if (!user || normalizeEmail(user.email) !== invitation.email) {
      throw new ForbiddenException(
        'This invitation is for a different account',
      );
    }

    if (user.emailVerifiedAt === null) {
      throw new ForbiddenException(
        'Verify your email address before accepting invitations',
      );
    }

    await this.prisma.$transaction((tx) => this.join(tx, invitation, userId));

    return { organizationId: invitation.organizationId };
  }

  async acceptWithNewAccount(
    input: AcceptInvitationWithNewAccountInput,
    options: AuthOptions = {},
  ): Promise<AuthResult & { organizationId: string }> {
    const invitation = await this.findPending(input.token);

    const result = await this.auth.registerInvited(
      {
        email: invitation.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      (tx, userId) => this.join(tx, invitation, userId),
      options,
    );

    return { ...result, organizationId: invitation.organizationId };
  }

  private async findPending(token: string): Promise<PendingInvitation> {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });

    if (
      !invitation ||
      invitation.acceptedAt !== null ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw invalidInvitation();
    }

    return invitation;
  }

  private async join(
    tx: Prisma.TransactionClient,
    invitation: PendingInvitation,
    userId: string,
  ): Promise<void> {
    const now = new Date();
    const claimed = await tx.organizationInvitation.updateMany({
      where: { id: invitation.id, organizationId: invitation.organizationId, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });

    if (claimed.count === 0) {
      throw invalidInvitation();
    }

    await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId,
          organizationId: invitation.organizationId,
        },
      },
      create: {
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
      update: {},
    });

    await this.activity.record(tx, {
      organizationId: invitation.organizationId,
      actorId: userId,
      action: 'INVITATION_ACCEPTED',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email },
    });
  }

  private async sendInvitationEmail(
    context: OrganizationContext,
    invitation: InvitationProjection,
    token: string,
    locale: EmailLocale,
  ): Promise<boolean> {
    const [organization, inviter] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { name: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: context.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const acceptUrl = new URL(
      '/invite',
      this.config.getOrThrow<string>('APP_URL'),
    );
    acceptUrl.searchParams.set('token', token);

    try {
      await this.email.send(
        invitationEmail({
          to: invitation.email,
          inviterName: `${inviter.firstName} ${inviter.lastName}`,
          organizationName: organization.name,
          role: invitation.role,
          acceptUrl: acceptUrl.toString(),
          expiresInDays: this.config.getOrThrow<number>('INVITATION_TTL_DAYS'),
          locale,
        }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Invitation email ${invitation.id} was not delivered: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private get ttlMs(): number {
    return this.config.getOrThrow<number>('INVITATION_TTL_DAYS') * MS_PER_DAY;
  }

  private async assertManager(
    context: OrganizationContext,
  ): Promise<OrganizationRole> {
    return requireCapability(
      this.prisma,
      context,
      'members.manage',
      'manage invitations',
    );
  }
}

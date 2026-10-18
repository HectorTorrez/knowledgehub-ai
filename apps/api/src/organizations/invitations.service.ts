import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AcceptInvitationResponse,
  CreateInvitationResponse,
  InvitationListResponse,
  OrganizationInvitationSummary,
  OrganizationRole,
} from '@knowledgehub/shared-types';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { MembershipRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    context: OrganizationContext,
    email: string,
  ): Promise<CreateInvitationResponse> {
    await this.assertOwner(context);

    const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: context.organizationId,
        email: normalizeEmail(email),
        role: MembershipRole.MEMBER,
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

    return {
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
    await this.assertOwner(context);

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

  async revoke(context: OrganizationContext, invitationId: string): Promise<void> {
    await this.assertOwner(context);

    const result = await this.prisma.organizationInvitation.deleteMany({
      where: { id: invitationId, organizationId: context.organizationId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Invitation not found');
    }
  }

  async accept(userId: string, token: string): Promise<AcceptInvitationResponse> {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (
      !invitation ||
      invitation.acceptedAt !== null ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException('Invitation is not valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || normalizeEmail(user.email) !== invitation.email) {
      throw new ForbiddenException(
        'This invitation is for a different account',
      );
    }

    await this.prisma.$transaction(async (tx) => {
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

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    return { organizationId: invitation.organizationId };
  }

  private get ttlMs(): number {
    return this.config.getOrThrow<number>('INVITATION_TTL_DAYS') * MS_PER_DAY;
  }

  private async assertOwner(context: OrganizationContext): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: context.userId,
          organizationId: context.organizationId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== MembershipRole.OWNER) {
      throw new ForbiddenException(
        'Only an organization owner can manage invitations',
      );
    }
  }
}

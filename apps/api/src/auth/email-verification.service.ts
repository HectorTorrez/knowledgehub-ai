import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailLocale } from '@knowledgehub/shared-types';
import { createHash, randomBytes } from 'node:crypto';
import { SecurityAuditService } from '../audit/security-audit.service.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../email/email-sender.port.js';
import {
  verificationEmail,
  welcomeEmail,
  type WelcomeEmailInput,
} from '../email/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const VERIFICATION_TOKEN_BYTES = 32;
const MS_PER_HOUR = 3_600_000;

export interface VerificationRecipient {
  id: string;
  email: string;
  firstName: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: SecurityAuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async sendWelcome(
    user: VerificationRecipient,
    locale: EmailLocale,
  ): Promise<void> {
    try {
      await this.issueAndSend(user, locale, welcomeEmail);
    } catch (error) {
      this.logger.warn(
        `Welcome email for user ${user.id} was not delivered: ${errorMessage(error)}`,
      );
    }
  }

  async resend(userId: string, locale: EmailLocale): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt !== null) {
      return;
    }

    try {
      await this.issueAndSend(user, locale, verificationEmail);
    } catch (error) {
      this.logger.warn(
        `Verification email for user ${user.id} was not delivered: ${errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'The verification email could not be sent',
      );
    }
  }

  async verify(token: string): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Verification link is not valid');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: record.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: record.userId },
      });
    });

    this.audit.record('auth.email.verified', { userId: record.userId });
  }

  private async issueAndSend(
    user: VerificationRecipient,
    locale: EmailLocale,
    template: (input: WelcomeEmailInput) => EmailMessage,
  ): Promise<void> {
    const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
    const ttlHours = this.config.getOrThrow<number>(
      'EMAIL_VERIFICATION_TTL_HOURS',
    );

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlHours * MS_PER_HOUR),
        },
      }),
    ]);

    const verifyUrl = new URL('/verify-email', this.appUrl);
    verifyUrl.searchParams.set('token', token);

    await this.email.send(
      template({
        to: user.email,
        firstName: user.firstName,
        verifyUrl: verifyUrl.toString(),
        expiresInHours: ttlHours,
        locale,
      }),
    );
  }

  private get appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

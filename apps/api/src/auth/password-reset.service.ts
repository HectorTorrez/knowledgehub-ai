import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailLocale } from '@knowledgehub/shared-types';
import { createHash, randomBytes } from 'node:crypto';
import { SecurityAuditService } from '../audit/security-audit.service.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.port.js';
import { passwordResetEmail } from '../email/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import { PasswordService } from './password.service.js';

const RESET_TOKEN_BYTES = 32;
const MS_PER_MINUTE = 60_000;

class InvalidResetTokenError extends Error {}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: SecurityAuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async request(email: string, locale: EmailLocale): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      return;
    }

    const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const ttlMinutes = this.config.getOrThrow<number>(
      'PASSWORD_RESET_TTL_MINUTES',
    );

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMinutes * MS_PER_MINUTE),
        },
      }),
    ]);

    this.audit.record('auth.password.reset_requested', { userId: user.id });

    const resetUrl = new URL('/reset-password', this.appUrl);
    resetUrl.searchParams.set('token', token);

    try {
      await this.email.send(
        passwordResetEmail({
          to: user.email,
          firstName: user.firstName,
          resetUrl: resetUrl.toString(),
          expiresInMinutes: ttlMinutes,
          locale,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Password reset email for user ${user.id} was not delivered: ${errorMessage(error)}`,
      );
    }
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    if (!record) {
      throw invalidLink();
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.deleteMany({
          where: { tokenHash, expiresAt: { gt: now } },
        });

        if (consumed.count === 0) {
          throw new InvalidResetTokenError();
        }

        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash },
        });
        await tx.user.updateMany({
          where: { id: record.userId, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
        await tx.passwordResetToken.deleteMany({
          where: { userId: record.userId },
        });
        await tx.authSession.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: now },
        });
      });
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        throw invalidLink();
      }
      throw error;
    }

    this.audit.record('auth.password.reset', { userId: record.userId });
  }

  private get appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }
}

function invalidLink(): NotFoundException {
  return new NotFoundException('Password reset link is not valid');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { PublicUser } from '@knowledgehub/shared-types';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { SecurityAuditService } from '../audit/security-audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import { AuthConfig } from './auth.config.js';
import type { LoginInput } from './dto/login.schema.js';
import type { RegisterInput } from './dto/register.schema.js';
import { PasswordService } from './password.service.js';
import { TokenService, type GeneratedRefreshToken } from './token.service.js';

export interface AuthOptions {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenMaxAgeMs?: number;
}

type RefreshOutcome =
  | {
      kind: 'ok';
      user: PersistedUser;
      sessionId: string;
      successor: GeneratedRefreshToken;
    }
  | { kind: 'replay'; sessionId: string }
  | { kind: 'inactive' }
  | { kind: 'invalid' };

interface PersistedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

const DUMMY_PASSWORD = 'knowledgehub-dummy-password-verification';

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly authConfig: AuthConfig,
    private readonly audit: SecurityAuditService,
  ) {}

  async register(
    input: RegisterInput,
    options: AuthOptions = {},
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwords.hash(input.password);
    const refreshToken = this.tokens.generateRefreshToken();

    let user: PersistedUser;
    let sessionId: string;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });

        const sessionId = await this.persistSession(
          tx,
          createdUser.id,
          refreshToken,
          options,
        );

        return { user: createdUser, sessionId };
      });

      user = created.user;
      sessionId = created.sessionId;
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        this.audit.record('auth.register.rejected', {
          reason: 'email_in_use',
          emailHash: hashEmail(email),
          ipAddress: options.ipAddress,
        });
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }

    this.audit.record('auth.register.succeeded', {
      userId: user.id,
      ipAddress: options.ipAddress,
    });

    const accessToken = await this.tokens.signAccessToken(user.id, sessionId);

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  async login(
    input: LoginInput,
    options: AuthOptions = {},
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.passwords.verify(
        await this.dummyPasswordHash(),
        input.password,
      );
      this.recordFailedLogin(email, options);
      throw invalidCredentials();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      this.recordFailedLogin(email, options);
      throw invalidCredentials();
    }

    const refreshToken = this.tokens.generateRefreshToken();
    const sessionId = await this.prisma.$transaction((tx) =>
      this.persistSession(tx, user.id, refreshToken, options),
    );

    const accessToken = await this.tokens.signAccessToken(user.id, sessionId);

    this.audit.record('auth.login.succeeded', {
      userId: user.id,
      ipAddress: options.ipAddress,
    });

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthResult> {
    if (!this.authConfig.browserAuthEnabled) {
      throw new UnauthorizedException('Browser authentication is disabled');
    }

    if (!rawRefreshToken) {
      throw invalidRefreshToken();
    }

    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken);

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<RefreshOutcome> => {
        const now = new Date();
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash },
        });

        if (!token) {
          return { kind: 'invalid' };
        }

        const session = await tx.authSession.findUnique({
          where: { id: token.sessionId },
        });

        if (!session) {
          return { kind: 'invalid' };
        }

        if (token.usedAt !== null) {
          await tx.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'replay', sessionId: session.id };
        }

        if (token.expiresAt.getTime() <= now.getTime()) {
          return { kind: 'invalid' };
        }

        const consumed = await tx.refreshToken.updateMany({
          where: { id: token.id, usedAt: null },
          data: { usedAt: now },
        });

        if (consumed.count === 0) {
          await tx.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'replay', sessionId: session.id };
        }

        const active = await tx.authSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { lastUsedAt: now },
        });

        if (active.count === 0) {
          return { kind: 'inactive' };
        }

        const successor = this.tokens.generateRefreshToken(session.expiresAt);
        await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            tokenHash: successor.hash,
            expiresAt: successor.expiresAt,
          },
        });

        const user = await tx.user.findUnique({
          where: { id: session.userId },
        });

        if (!user) {
          return { kind: 'invalid' };
        }

        return { kind: 'ok', user, sessionId: session.id, successor };
      },
    );

    if (outcome.kind !== 'ok') {
      if (outcome.kind === 'replay') {
        this.audit.record('auth.refresh.replay_detected', {
          sessionId: outcome.sessionId,
        });
      }
      throw invalidRefreshToken();
    }

    const accessToken = await this.tokens.signAccessToken(
      outcome.user.id,
      outcome.sessionId,
    );

    return {
      user: toPublicUser(outcome.user),
      accessToken,
      refreshToken: outcome.successor.token,
      refreshTokenMaxAgeMs: Math.max(
        0,
        outcome.successor.expiresAt.getTime() - Date.now(),
      ),
    };
  }

  async getSessionUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Session is no longer active');
    }

    return toPublicUser(user);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!this.authConfig.browserAuthEnabled || !rawRefreshToken) {
      return;
    }

    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!token) {
      return;
    }

    await this.prisma.authSession.updateMany({
      where: { id: token.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.audit.record('auth.logout', { sessionId: token.sessionId });
  }

  private async persistSession(
    tx: Prisma.TransactionClient,
    userId: string,
    refreshToken: GeneratedRefreshToken,
    options: AuthOptions,
  ): Promise<string> {
    const session = await tx.authSession.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + this.authConfig.sessionTtlMs),
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
      },
    });

    await tx.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: refreshToken.hash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    return session.id;
  }

  private recordFailedLogin(email: string, options: AuthOptions): void {
    this.audit.record('auth.login.failed', {
      emailHash: hashEmail(email),
      ipAddress: options.ipAddress,
    });
  }

  private dummyPasswordHash(): Promise<string> {
    return (this.dummyHash ??= this.passwords.hash(DUMMY_PASSWORD));
  }
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException('Invalid email or password');
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException('Invalid or expired refresh token');
}

function toPublicUser(user: PersistedUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function isUniqueEmailViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta as
    | { modelName?: string; target?: unknown }
    | undefined;

  if (meta?.modelName === 'User') {
    return true;
  }

  const target = Array.isArray(meta?.target) ? meta.target.map(String) : [];
  return target.some((field) => field.toLowerCase().includes('email'));
}

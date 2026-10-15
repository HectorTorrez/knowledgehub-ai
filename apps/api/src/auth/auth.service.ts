import { ConflictException, Injectable } from '@nestjs/common';
import type { PublicUser } from '@knowledgehub/shared-types';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../users/email.js';
import { AuthConfig } from './auth.config.js';
import type { RegisterInput } from './dto/register.schema.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

export interface RegisterOptions {
  userAgent?: string;
  ipAddress?: string;
}

export interface RegisterResult {
  user: PublicUser;
  /** Raw access token. Delivered as a cookie, never in the response body. */
  accessToken: string;
  /** Raw refresh token. Delivered as a cookie, never in the response body. */
  refreshToken: string;
}

interface PersistedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Registration use case. Owns password hashing and account/session creation. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly authConfig: AuthConfig,
  ) {}

  async register(
    input: RegisterInput,
    options: RegisterOptions = {},
  ): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwords.hash(input.password);
    const refreshToken = this.tokens.generateRefreshToken();
    const sessionExpiresAt = new Date(
      Date.now() + this.authConfig.sessionTtlMs,
    );

    let user: PersistedUser;
    let sessionId: string;

    try {
      // User, session and initial refresh token are created atomically. If any
      // step fails, the transaction rolls back and no partial account remains.
      const created = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });

        const createdSession = await tx.authSession.create({
          data: {
            userId: createdUser.id,
            expiresAt: sessionExpiresAt,
            userAgent: options.userAgent,
            ipAddress: options.ipAddress,
          },
        });

        await tx.refreshToken.create({
          data: {
            sessionId: createdSession.id,
            tokenHash: refreshToken.hash,
            expiresAt: refreshToken.expiresAt,
          },
        });

        return { user: createdUser, sessionId: createdSession.id };
      });

      user = created.user;
      sessionId = created.sessionId;
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }

    const accessToken = await this.tokens.signAccessToken(user.id, sessionId);

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refreshToken.token,
    };
  }
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

/**
 * True only for a Postgres unique-constraint violation on `User.email`.
 *
 * Scoped deliberately narrowly: a unique violation elsewhere (for example on
 * `RefreshToken.tokenHash`) must surface as an internal error, never as a
 * misleading "email already registered" 409.
 */
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

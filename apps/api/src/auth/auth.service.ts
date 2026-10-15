import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { PublicUser } from '@knowledgehub/shared-types';
import { Prisma } from '../generated/prisma/client.js';
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
  /** Raw access token. Delivered as a cookie, never in the response body. */
  accessToken: string;
  /** Raw refresh token. Delivered as a cookie, never in the response body. */
  refreshToken: string;
  /**
   * Max-Age (ms) for the refresh cookie. Defaults to the configured refresh TTL
   * when omitted; rotation sets the successor's remaining lifetime so the cookie
   * cannot outlive the (clamped) refresh token.
   */
  refreshTokenMaxAgeMs?: number;
}

/** Discriminated outcome of the refresh transaction. */
type RefreshOutcome =
  | {
      kind: 'ok';
      user: PersistedUser;
      sessionId: string;
      successor: GeneratedRefreshToken;
    }
  | { kind: 'replay' }
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

/**
 * Plaintext used only to derive a throwaway Argon2id hash. It is never an
 * account password; the hash exists solely to spend the same verification cost
 * on a login for an unknown email as for a known one.
 */
const DUMMY_PASSWORD = 'knowledgehub-dummy-password-verification';

/** Registration and login use case. Owns hashing, verification and sessions. */
@Injectable()
export class AuthService {
  /** Memoized dummy hash so unknown-email logins do the same Argon2 work. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly authConfig: AuthConfig,
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

  async login(
    input: LoginInput,
    options: AuthOptions = {},
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Spend the same Argon2id verification cost as the known-email path so
      // response timing does not reveal whether the address is registered. The
      // result is intentionally discarded.
      await this.passwords.verify(
        await this.dummyPasswordHash(),
        input.password,
      );
      throw invalidCredentials();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      throw invalidCredentials();
    }

    // A fresh session and its initial refresh token are created atomically, so
    // a failure leaves no half-provisioned session behind. Cookies are only set
    // by the caller after this transaction commits.
    const refreshToken = this.tokens.generateRefreshToken();
    const sessionId = await this.prisma.$transaction((tx) =>
      this.persistSession(tx, user.id, refreshToken, options),
    );

    const accessToken = await this.tokens.signAccessToken(user.id, sessionId);

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  /**
   * Rotates a refresh token: consumes the presented token, issues a successor
   * and returns a fresh access token.
   *
   * The whole exchange runs in one transaction. The token is consumed with a
   * conditional update (`usedAt: null` in the WHERE clause), so exactly one of
   * several concurrent requests can win it; the losers are treated as replays.
   * Session activity and expiry are re-checked by a conditional update on the
   * session row itself, which also updates `lastUsedAt` and serializes against a
   * concurrent logout/revocation. Replays revoke the session and the revocation
   * is committed before the 401 is raised: the transaction returns an outcome
   * rather than throwing, so a replay cannot be rolled back. The access token is
   * signed only after the transaction commits.
   *
   * Browser (cookie) refresh is rejected outright when browser authentication is
   * disabled; there is no bearer refresh path.
   */
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

        // A used token is a replay: revoke the whole session, but return an
        // outcome so the caller can throw 401 after this revocation commits.
        if (token.usedAt !== null) {
          await tx.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'replay' };
        }

        if (token.expiresAt.getTime() <= now.getTime()) {
          return { kind: 'invalid' };
        }

        // Single-use consumption. The conditional WHERE makes this atomic: a
        // concurrent request that already consumed the token updates 0 rows.
        const consumed = await tx.refreshToken.updateMany({
          where: { id: token.id, usedAt: null },
          data: { usedAt: now },
        });

        if (consumed.count === 0) {
          await tx.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'replay' };
        }

        // Re-check activity/expiry and lock the session row. An update that
        // matches 0 rows means the session was revoked or expired (possibly by a
        // concurrent logout that committed first), so no successor is issued.
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

        // Cap the successor at the session's absolute expiry so rotation never
        // extends the overall session lifetime.
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
      throw invalidRefreshToken();
    }

    // Signed only once the rotation has committed, so a rolled-back exchange
    // never yields a usable access token.
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

  /**
   * Revokes the session identified by the presented refresh token. Deliberately
   * does not require an access token, so logout still works when the access
   * token has expired.
   *
   * It is idempotent and revokes only the matching session, leaving the user's
   * other devices signed in. When browser authentication is disabled the cookie
   * is not trusted, so no session is revoked; the caller still clears cookies.
   * An unknown or already-used token is ignored (the row is kept for replay
   * detection).
   */
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
  }

  /**
   * Creates a session with its initial refresh token inside the caller's
   * transaction. Shared by register and login so both provision the same shape:
   * an absolute-lifetime session plus one hashed, single-use refresh token.
   */
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

  /**
   * A valid Argon2id hash generated once per process from the configured
   * options. Deriving it through {@link PasswordService} keeps the dummy
   * verification's work factor identical to a real one even if the parameters
   * change.
   */
  private dummyPasswordHash(): Promise<string> {
    return (this.dummyHash ??= this.passwords.hash(DUMMY_PASSWORD));
  }
}

/** Identical response for an unknown email and an incorrect password. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException('Invalid email or password');
}

/**
 * Identical 401 for every rejected refresh attempt (unknown, expired, revoked
 * or replayed). The response deliberately does not distinguish the cases.
 */
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

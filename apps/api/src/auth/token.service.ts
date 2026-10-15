import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from './auth.config.js';

/** Claims carried by access tokens. `sid` ties the token to a session. */
export interface AccessTokenPayload {
  sub: string;
  sid: string;
  iat?: number;
  exp?: number;
}

export interface GeneratedRefreshToken {
  /** Opaque token returned to the client. Never stored. */
  token: string;
  /** SHA-256 hash of the token. This is what gets persisted. */
  hash: string;
  expiresAt: Date;
}

const REFRESH_TOKEN_BYTES = 32;

/**
 * Creates and validates authentication tokens.
 *
 * Access tokens are signed JWTs. Refresh tokens are opaque, high-entropy random
 * strings whose hash (not the token) is persisted, so a database leak does not
 * expose usable credentials.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly authConfig: AuthConfig,
  ) {}

  signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      {
        secret: this.authConfig.accessSecret,
        expiresIn: Math.floor(this.authConfig.accessTtlMs / 1000),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.authConfig.accessSecret,
    });

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.sid !== 'string' ||
      payload.sid.length === 0
    ) {
      throw new Error('Access token is missing required claims');
    }

    return payload;
  }

  /**
   * Generates an opaque refresh token. `notAfter` optionally caps the token's
   * lifetime (rotation passes the session's absolute expiry) so a rotated token
   * can never outlive its session.
   */
  generateRefreshToken(notAfter?: Date): GeneratedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const defaultExpiry = Date.now() + this.authConfig.refreshTtlMs;
    const cappedExpiry =
      notAfter === undefined
        ? defaultExpiry
        : Math.min(defaultExpiry, notAfter.getTime());

    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(cappedExpiry),
    };
  }

  /** Deterministic one-way hash for storing/looking up refresh tokens. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

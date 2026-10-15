import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { TokenService } from './token.service.js';

/** Shape attached to the request once a session is validated. */
export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
}

/**
 * Guards endpoints that require an authenticated, active session.
 *
 * Verifies the access token signature and expiry, then confirms the referenced
 * session still exists, is not revoked, and has not expired. Revoking a session
 * therefore invalidates its access tokens immediately, not just on JWT expiry.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
    });

    const isActive =
      session !== null &&
      session.userId === payload.sub &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now();

    if (!session || !isActive) {
      throw new UnauthorizedException('Session is no longer active');
    }

    request.auth = { userId: session.userId, sessionId: session.id };
    return true;
  }
}

function extractToken(request: Request): string | undefined {
  const cookie = request.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookie === 'string' && cookie.length > 0) {
    return cookie;
  }

  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const bearer = header.slice('Bearer '.length);
    return bearer.length > 0 ? bearer : undefined;
  }

  return undefined;
}

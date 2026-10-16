import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthConfig } from './auth.config.js';
import { extractBearerToken } from './authorization.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { TokenService } from './token.service.js';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
}

interface ExtractedToken {
  token: string;
  source: 'bearer' | 'cookie';
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly authConfig: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const extracted = extractToken(request);

    if (!extracted) {
      throw new UnauthorizedException('Authentication required');
    }

    if (extracted.source === 'cookie' && !this.authConfig.browserAuthEnabled) {
      throw new UnauthorizedException('Browser authentication is disabled');
    }

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(extracted.token);
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

function extractToken(request: Request): ExtractedToken | undefined {
  const bearer = extractBearerToken(request.headers.authorization);
  if (bearer !== undefined) {
    return { token: bearer, source: 'bearer' };
  }

  const cookie = request.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookie === 'string' && cookie.length > 0) {
    return { token: cookie, source: 'cookie' };
  }

  return undefined;
}

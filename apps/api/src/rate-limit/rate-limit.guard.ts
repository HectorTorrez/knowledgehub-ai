import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { SecurityAuditService } from '../audit/security-audit.service.js';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import type { OrganizationRequest } from '../organizations/organization-context.js';
import { normalizeEmail } from '../users/email.js';
import {
  RateLimitConfig,
  type RateLimitBudgetName,
  type RateLimitScope,
} from './rate-limit.config.js';
import { RATE_LIMIT_STORE, type RateLimitStore } from './rate-limit.store.js';

export const RATE_LIMIT_BUDGETS = 'knowledgehub:rate-limit-budgets';

export function RateLimit(...budgets: RateLimitBudgetName[]): MethodDecorator {
  return SetMetadata(RATE_LIMIT_BUDGETS, budgets);
}

type RateLimitedRequest = AuthenticatedRequest &
  OrganizationRequest & { body?: unknown };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: RateLimitConfig,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly audit: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const budgets = this.reflector.getAllAndOverride<RateLimitBudgetName[]>(
      RATE_LIMIT_BUDGETS,
      [context.getHandler(), context.getClass()],
    );

    if (!budgets || budgets.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();

    for (const name of budgets) {
      const budget = this.config.budget(name);
      const key = this.resolveKey(budget.scope, request);
      if (!key) {
        continue;
      }

      const { count, resetAtMs } = await this.store.hit(key, budget.windowMs);
      if (count > budget.limit) {
        this.audit.record('rate_limit.exceeded', {
          budget: name,
          scope: budget.scope,
          ip: request.ip,
          userId: request.auth?.userId,
          organizationId: request.organizationContext?.organizationId,
        });
        throw this.tooManyRequests(context, resetAtMs);
      }
    }

    return true;
  }

  private resolveKey(
    scope: RateLimitScope,
    request: RateLimitedRequest,
  ): string | undefined {
    if (scope === 'ip') {
      return `ip:${request.ip}`;
    }

    if (scope === 'account') {
      const email = readEmail(request.body);
      return email ? `account:${hashEmail(email)}` : undefined;
    }

    if (scope === 'user') {
      const userId = request.auth?.userId;
      return userId ? `user:${userId}` : undefined;
    }

    const organizationId = request.organizationContext?.organizationId;
    return organizationId ? `tenant:${organizationId}` : undefined;
  }

  private tooManyRequests(
    context: ExecutionContext,
    resetAtMs: number,
  ): HttpException {
    const response = context.switchToHttp().getResponse<Response>();
    const retryAfter = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
    response.setHeader('Retry-After', String(retryAfter));

    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function readEmail(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const email = (body as { email?: unknown }).email;

  if (typeof email !== 'string') {
    return undefined;
  }

  const normalized = normalizeEmail(email);
  return normalized.length > 0 && normalized.length <= 320
    ? normalized
    : undefined;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

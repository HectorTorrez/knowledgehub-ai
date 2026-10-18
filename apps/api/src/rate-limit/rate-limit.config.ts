import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RateLimitScope = 'ip' | 'user' | 'tenant';

export type RateLimitBudgetName =
  | 'login'
  | 'search'
  | 'answerUser'
  | 'answerTenant';

export interface RateLimitBudget {
  scope: RateLimitScope;
  limit: number;
  windowMs: number;
}

const ONE_MINUTE_MS = 60_000;

@Injectable()
export class RateLimitConfig {
  constructor(private readonly config: ConfigService) {}

  budget(name: RateLimitBudgetName): RateLimitBudget {
    switch (name) {
      case 'login':
        return {
          scope: 'ip',
          limit: this.config.getOrThrow<number>('RATE_LIMIT_LOGIN_PER_MINUTE'),
          windowMs: ONE_MINUTE_MS,
        };
      case 'search':
        return {
          scope: 'tenant',
          limit: this.config.getOrThrow<number>('RATE_LIMIT_SEARCH_PER_MINUTE'),
          windowMs: ONE_MINUTE_MS,
        };
      case 'answerUser':
        return {
          scope: 'user',
          limit: this.config.getOrThrow<number>(
            'RATE_LIMIT_ANSWER_USER_PER_MINUTE',
          ),
          windowMs: ONE_MINUTE_MS,
        };
      case 'answerTenant':
        return {
          scope: 'tenant',
          limit: this.config.getOrThrow<number>(
            'RATE_LIMIT_ANSWER_TENANT_PER_MINUTE',
          ),
          windowMs: ONE_MINUTE_MS,
        };
    }
  }

  get answerQuotaDaily(): number {
    return this.config.getOrThrow<number>('QUOTA_ANSWER_DAILY');
  }
}

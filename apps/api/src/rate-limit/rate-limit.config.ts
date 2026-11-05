import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RateLimitScope = 'ip' | 'account' | 'user' | 'tenant';

export interface RateLimitBudget {
  scope: RateLimitScope;
  limit: number;
  windowMs: number;
}

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const BUDGETS = {
  login: {
    scope: 'ip',
    envKey: 'RATE_LIMIT_LOGIN_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  loginAccount: {
    scope: 'account',
    envKey: 'RATE_LIMIT_LOGIN_ACCOUNT_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  registerHourly: {
    scope: 'ip',
    envKey: 'RATE_LIMIT_REGISTER_PER_HOUR',
    windowMs: ONE_HOUR_MS,
  },
  search: {
    scope: 'tenant',
    envKey: 'RATE_LIMIT_SEARCH_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  searchUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_SEARCH_USER_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  answerUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_ANSWER_USER_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  answerTenant: {
    scope: 'tenant',
    envKey: 'RATE_LIMIT_ANSWER_TENANT_PER_MINUTE',
    windowMs: ONE_MINUTE_MS,
  },
  answerUserDaily: {
    scope: 'user',
    envKey: 'RATE_LIMIT_ANSWER_USER_PER_DAY',
    windowMs: ONE_DAY_MS,
  },
  documentWriteUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_DOCUMENT_WRITE_USER_PER_HOUR',
    windowMs: ONE_HOUR_MS,
  },
  verificationEmailUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_VERIFICATION_EMAIL_USER_PER_HOUR',
    windowMs: ONE_HOUR_MS,
  },
  passwordResetAccount: {
    scope: 'account',
    envKey: 'RATE_LIMIT_PASSWORD_RESET_ACCOUNT_PER_HOUR',
    windowMs: ONE_HOUR_MS,
  },
  invitationUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_INVITATION_USER_PER_HOUR',
    windowMs: ONE_HOUR_MS,
  },
  organizationCreateUser: {
    scope: 'user',
    envKey: 'RATE_LIMIT_ORGANIZATION_CREATE_USER_PER_DAY',
    windowMs: ONE_DAY_MS,
  },
} as const satisfies Record<
  string,
  { scope: RateLimitScope; envKey: string; windowMs: number }
>;

export type RateLimitBudgetName = keyof typeof BUDGETS;

@Injectable()
export class RateLimitConfig {
  constructor(private readonly config: ConfigService) {}

  budget(name: RateLimitBudgetName): RateLimitBudget {
    const { scope, envKey, windowMs } = BUDGETS[name];
    return {
      scope,
      limit: this.config.getOrThrow<number>(envKey),
      windowMs,
    };
  }

  get answerQuotaDaily(): number {
    return this.config.getOrThrow<number>('QUOTA_ANSWER_DAILY');
  }

  get documentQuotaPerOrganization(): number {
    return this.config.getOrThrow<number>('QUOTA_DOCUMENTS_PER_ORGANIZATION');
  }
}

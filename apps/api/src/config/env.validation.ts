import { z } from 'zod';
import {
  DEFAULT_ANSWER_CONTEXT_MAX_CHARS,
  DEFAULT_ANSWER_HISTORY_MAX_CHARS,
  DEFAULT_ANSWER_MAX_OUTPUT_TOKENS,
  DEFAULT_ANSWER_MAX_SOURCES,
  DEFAULT_ANSWER_MIN_SIMILARITY,
  DEFAULT_ANSWER_MODEL,
  DEFAULT_ANSWER_TIMEOUT_MS,
  MAX_ANSWER_CONTEXT_MAX_CHARS,
  MAX_ANSWER_HISTORY_MAX_CHARS,
  MAX_ANSWER_OUTPUT_TOKENS,
  MAX_ANSWER_SOURCES,
  MIN_ANSWER_CONTEXT_MAX_CHARS,
  MIN_ANSWER_HISTORY_MAX_CHARS,
} from '../answers/answer-policy.js';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  DEFAULT_OPENAI_BASE_URL,
  EMBEDDING_VECTOR_DIMENSIONS,
} from '../embeddings/embedding-policy.js';
import {
  DEFAULT_FACTS_BACKFILL_BATCH,
  DEFAULT_FACTS_CURRENCIES,
  DEFAULT_FACTS_MAX_INPUT_CHARS,
  DEFAULT_FACTS_MAX_OUTPUT_TOKENS,
  DEFAULT_FACTS_TIMEOUT_MS,
  MAX_FACTS_OUTPUT_TOKENS,
} from '../facts/facts.config.js';

const envObjectSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+(s|m|h|d)$/, 'JWT_ACCESS_TTL must look like 15s, 15m, 1h or 7d')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .max(365)
    .default(7),

  INVITATION_TTL_DAYS: z.coerce.number().int().positive().max(365).default(7),

  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  TRUST_PROXY: z
    .string()
    .regex(
      /^(false|[1-9]\d*)$/,
      'TRUST_PROXY must be "false" or a positive number of proxy hops',
    )
    .default('false'),

  BROWSER_AUTH_ENABLED: z.enum(['true', 'false']).default('false'),
  CSRF_SECRET: z
    .string()
    .min(32, 'CSRF_SECRET must be at least 32 characters')
    .optional(),

  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ENDPOINT: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'STORAGE_ENDPOINT must be an http or https URL' },
    )
    .optional(),
  STORAGE_REGION: z.string().min(1).default('auto'),
  STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  STORAGE_UPLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  STORAGE_DOWNLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  STORAGE_ACCESS_KEY_ID: z
    .string()
    .min(1, 'STORAGE_ACCESS_KEY_ID must not be empty')
    .optional(),
  STORAGE_SECRET_ACCESS_KEY: z
    .string()
    .min(32, 'STORAGE_SECRET_ACCESS_KEY must be at least 32 characters')
    .optional(),

  STORAGE_SWEEP_ENABLED: z.enum(['true', 'false']).default('false'),
  STORAGE_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600000),
  STORAGE_SWEEP_GRACE_MINUTES: z.coerce.number().int().positive().default(60),

  PROCESSING_WORKER_ENABLED: z.enum(['true', 'false']).default('false'),
  PROCESSING_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  PROCESSING_LEASE_RENEWAL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(20000),
  PROCESSING_RECOVERY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),

  PROCESSING_SANDBOX: z.enum(['inline', 'worker']).default('inline'),
  PROCESSING_PDF_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),
  PROCESSING_PDF_MAX_MEMORY_MB: z.coerce
    .number()
    .int()
    .positive()
    .default(512),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().default(DEFAULT_OPENAI_BASE_URL),
  EMBEDDING_MODEL: z.string().min(1).default(DEFAULT_EMBEDDING_MODEL),
  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(EMBEDDING_VECTOR_DIMENSIONS),
  EMBEDDING_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(2048)
    .default(DEFAULT_EMBEDDING_BATCH_SIZE),
  EMBEDDING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_EMBEDDING_TIMEOUT_MS),

  ANSWER_MODEL: z.string().min(1).default(DEFAULT_ANSWER_MODEL),
  ANSWER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_ANSWER_TIMEOUT_MS),
  ANSWER_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_ANSWER_OUTPUT_TOKENS)
    .default(DEFAULT_ANSWER_MAX_OUTPUT_TOKENS),
  ANSWERS_ENABLED: z.enum(['true', 'false']).default('false'),
  ANSWER_MAX_SOURCES: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_ANSWER_SOURCES)
    .default(DEFAULT_ANSWER_MAX_SOURCES),
  ANSWER_CONTEXT_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(MIN_ANSWER_CONTEXT_MAX_CHARS)
    .max(MAX_ANSWER_CONTEXT_MAX_CHARS)
    .default(DEFAULT_ANSWER_CONTEXT_MAX_CHARS),
  ANSWER_MIN_SIMILARITY: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(DEFAULT_ANSWER_MIN_SIMILARITY),

  ANSWER_HISTORY_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(MIN_ANSWER_HISTORY_MAX_CHARS)
    .max(MAX_ANSWER_HISTORY_MAX_CHARS)
    .default(DEFAULT_ANSWER_HISTORY_MAX_CHARS),

  FACTS_ENABLED: z.enum(['true', 'false']).default('false'),
  FACTS_BACKFILL_ENABLED: z.enum(['true', 'false']).default('true'),
  FACTS_MODEL: z.string().min(1).default(DEFAULT_ANSWER_MODEL),
  FACTS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_FACTS_TIMEOUT_MS),
  FACTS_MAX_INPUT_CHARS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(100_000)
    .default(DEFAULT_FACTS_MAX_INPUT_CHARS),
  FACTS_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FACTS_OUTPUT_TOKENS)
    .default(DEFAULT_FACTS_MAX_OUTPUT_TOKENS),
  FACTS_CURRENCIES: z
    .string()
    .regex(
      /^[A-Z]{3}(,[A-Z]{3})*$/,
      'FACTS_CURRENCIES must be a comma-separated list of ISO 4217 codes',
    )
    .default(DEFAULT_FACTS_CURRENCIES),
  FACTS_BACKFILL_BATCH: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_FACTS_BACKFILL_BATCH),

  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_ACCOUNT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  RATE_LIMIT_SEARCH_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_SEARCH_USER_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  RATE_LIMIT_REDIS_URL: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === 'redis:' || protocol === 'rediss:';
        } catch {
          return false;
        }
      },
      { message: 'RATE_LIMIT_REDIS_URL must be a redis or rediss URL' },
    )
    .optional(),
  RATE_LIMIT_ANSWER_USER_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  RATE_LIMIT_ANSWER_TENANT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  QUOTA_ANSWER_DAILY: z.coerce.number().int().positive().default(1000),

  METRICS_ENABLED: z.enum(['true', 'false']).default('false'),
});

const PRODUCTION_STORAGE_KEYS = [
  'STORAGE_BUCKET',
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
] as const;

const PLACEHOLDER_SECRET_PATTERN =
  /(replace-me|change-me|changeme|placeholder|example-secret|your-secret)/i;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isPlaceholderSecret(value: string | undefined): boolean {
  return value !== undefined && PLACEHOLDER_SECRET_PATTERN.test(value);
}

function hasLocalOrigin(raw: string): boolean {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .some((origin) => {
      try {
        return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
      } catch {
        return false;
      }
    });
}

export const envSchema = envObjectSchema.superRefine((env, ctx) => {
  if (env.BROWSER_AUTH_ENABLED === 'true' && env.CSRF_SECRET === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['CSRF_SECRET'],
      message: 'CSRF_SECRET is required when BROWSER_AUTH_ENABLED is true',
    });
  }

  if (env.EMBEDDING_DIMENSIONS !== EMBEDDING_VECTOR_DIMENSIONS) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMBEDDING_DIMENSIONS'],
      message: `EMBEDDING_DIMENSIONS must equal the stored vector dimension (${EMBEDDING_VECTOR_DIMENSIONS})`,
    });
  }

  if (
    env.PROCESSING_WORKER_ENABLED === 'true' &&
    env.OPENAI_API_KEY === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY is required when the processing worker is enabled',
    });
  }

  if (env.ANSWERS_ENABLED === 'true' && env.OPENAI_API_KEY === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY is required when answer generation is enabled',
    });
  }

  if (env.FACTS_ENABLED === 'true' && env.OPENAI_API_KEY === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY is required when fact extraction is enabled',
    });
  }

  if (env.NODE_ENV === 'production') {
    for (const key of PRODUCTION_STORAGE_KEYS) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when NODE_ENV is production`,
        });
      }
    }

    for (const key of [
      'DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'CSRF_SECRET',
      'STORAGE_SECRET_ACCESS_KEY',
      'OPENAI_API_KEY',
    ] as const) {
      if (isPlaceholderSecret(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} still contains a placeholder value`,
        });
      }
    }

    if (hasLocalOrigin(env.CORS_ORIGIN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must not target a local host in production',
      });
    }

    if (env.COOKIE_SECURE === 'false') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE cannot be false when NODE_ENV is production',
      });
    }

    if (env.PROCESSING_SANDBOX !== 'worker') {
      ctx.addIssue({
        code: 'custom',
        path: ['PROCESSING_SANDBOX'],
        message:
          'PROCESSING_SANDBOX must be "worker" when NODE_ENV is production',
      });
    }

    if (env.STORAGE_SWEEP_ENABLED !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_SWEEP_ENABLED'],
        message:
          'STORAGE_SWEEP_ENABLED must be "true" when NODE_ENV is production',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  return result.data;
}

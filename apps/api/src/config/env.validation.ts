import { z } from 'zod';
import {
  DEFAULT_ANSWER_CONTEXT_MAX_CHARS,
  DEFAULT_ANSWER_MAX_OUTPUT_TOKENS,
  DEFAULT_ANSWER_MAX_SOURCES,
  DEFAULT_ANSWER_MIN_SIMILARITY,
  DEFAULT_ANSWER_MODEL,
  DEFAULT_ANSWER_TIMEOUT_MS,
  MAX_ANSWER_CONTEXT_MAX_CHARS,
  MAX_ANSWER_OUTPUT_TOKENS,
  MAX_ANSWER_SOURCES,
  MIN_ANSWER_CONTEXT_MAX_CHARS,
} from '../answers/answer-policy.js';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  DEFAULT_OPENAI_BASE_URL,
  EMBEDDING_VECTOR_DIMENSIONS,
} from '../embeddings/embedding-policy.js';

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

  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().min(1).optional(),

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

  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SEARCH_PER_MINUTE: z.coerce.number().int().positive().default(60),
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
});

const PRODUCTION_STORAGE_KEYS = [
  'STORAGE_BUCKET',
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
] as const;

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

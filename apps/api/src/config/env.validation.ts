import { z } from 'zod';

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

import { z } from 'zod';

/**
 * Runtime environment contract for the API.
 *
 * Parsed once at startup by `ConfigModule`, so a missing or malformed
 * authentication setting fails fast instead of surfacing on the first request.
 * Values are coerced/defaulted here and read via `ConfigService` afterwards.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Access-token signing secret. Must be strong and supplied per environment.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  // Access-token lifetime, e.g. 15m, 1h. Kept short on purpose.
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+(s|m|h|d)$/, 'JWT_ACCESS_TTL must look like 15s, 15m, 1h or 7d')
    .default('15m'),
  // Refresh-token and session lifetime in days. Kept short for the MVP (7).
  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .max(365)
    .default(7),

  // Cookie behavior. When COOKIE_SECURE is unset it defaults to on in
  // production. SameSite defaults to the safe "lax".
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates and normalizes the environment. Throws on invalid configuration. */
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

// Deterministic, non-secret defaults for the test environment. Real values for
// `DATABASE_URL` come from `.env` or the process environment (the e2e tests
// exercise a real PostgreSQL instance).
process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-value-32-chars-min';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
process.env.COOKIE_SAMESITE ??= 'lax';

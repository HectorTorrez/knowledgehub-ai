// Deterministic, non-secret defaults for the test environment. Real values for
// `DATABASE_URL` come from `.env` or the process environment (the e2e tests
// exercise a real PostgreSQL instance).
process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-value-32-chars-min';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '7';
process.env.COOKIE_SAMESITE ??= 'lax';

// Browser (cookie) authentication is opt-in and requires a CSRF secret. The
// e2e suite exercises the cookie flow, so both are enabled here.
process.env.BROWSER_AUTH_ENABLED ??= 'true';
process.env.CSRF_SECRET ??= 'test-only-csrf-secret-value-0123456789abcdef';

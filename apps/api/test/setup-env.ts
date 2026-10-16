process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-value-32-chars-min';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '7';
process.env.COOKIE_SAMESITE ??= 'lax';

process.env.BROWSER_AUTH_ENABLED ??= 'true';
process.env.CSRF_SECRET ??= 'test-only-csrf-secret-value-0123456789abcdef';

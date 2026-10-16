process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-value-32-chars-min';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '7';
process.env.COOKIE_SAMESITE ??= 'lax';

process.env.BROWSER_AUTH_ENABLED ??= 'true';
process.env.CSRF_SECRET ??= 'test-only-csrf-secret-value-0123456789abcdef';

process.env.STORAGE_BUCKET ??= 'knowledgehub-test-documents';
process.env.STORAGE_ENDPOINT ??= 'http://127.0.0.1:9000';
process.env.STORAGE_REGION ??= 'auto';
process.env.STORAGE_FORCE_PATH_STYLE ??= 'true';
process.env.STORAGE_ACCESS_KEY_ID ??= 'test-only-storage-access-key-id-000000';
process.env.STORAGE_SECRET_ACCESS_KEY ??=
  'test-only-storage-secret-access-key-000000';

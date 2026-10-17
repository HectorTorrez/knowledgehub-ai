import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

const validStorageEnv = {
  STORAGE_BUCKET: 'knowledgehub-documents',
  STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
  STORAGE_ACCESS_KEY_ID: 'a'.repeat(32),
  STORAGE_SECRET_ACCESS_KEY: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies safe defaults when optional values are absent', () => {
    const env = validateEnv({ ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.COOKIE_SAMESITE).toBe('lax');
    expect(env.COOKIE_SECURE).toBeUndefined();
    expect(env.BROWSER_AUTH_ENABLED).toBe('false');
    expect(env.CSRF_SECRET).toBeUndefined();
    expect(env.STORAGE_REGION).toBe('auto');
    expect(env.STORAGE_FORCE_PATH_STYLE).toBe('false');
    expect(env.STORAGE_UPLOAD_TTL_SECONDS).toBe(900);
    expect(env.STORAGE_BUCKET).toBeUndefined();
    expect(env.STORAGE_ENDPOINT).toBeUndefined();
    expect(env.STORAGE_ACCESS_KEY_ID).toBeUndefined();
    expect(env.STORAGE_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(env.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(env.EMBEDDING_DIMENSIONS).toBe(1536);
    expect(env.EMBEDDING_BATCH_SIZE).toBe(64);
    expect(env.EMBEDDING_TIMEOUT_MS).toBe(30000);
    expect(env.ANSWER_MODEL).toBe('gpt-4.1-mini');
    expect(env.ANSWER_TIMEOUT_MS).toBe(30000);
    expect(env.ANSWER_MAX_OUTPUT_TOKENS).toBe(700);
  });

  it('coerces numeric strings', () => {
    const env = validateEnv({
      ...validEnv,
      PORT: '4321',
      REFRESH_TOKEN_TTL_DAYS: '7',
    });

    expect(env.PORT).toBe(4321);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('coerces a storage upload TTL supplied as a string', () => {
    const env = validateEnv({ ...validEnv, STORAGE_UPLOAD_TTL_SECONDS: '120' });

    expect(env.STORAGE_UPLOAD_TTL_SECONDS).toBe(120);
  });

  it('accepts an explicit storage path-style override', () => {
    const env = validateEnv({ ...validEnv, STORAGE_FORCE_PATH_STYLE: 'true' });

    expect(env.STORAGE_FORCE_PATH_STYLE).toBe('true');
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _drop, ...withoutDatabase } = validEnv;
    expect(() => validateEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it('rejects a missing JWT_ACCESS_SECRET', () => {
    const { JWT_ACCESS_SECRET: _drop, ...withoutSecret } = validEnv;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT_ACCESS_SECRET shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a malformed JWT_ACCESS_TTL', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_TTL: '15x' }),
    ).toThrow(/JWT_ACCESS_TTL/);
  });

  it('rejects an invalid refresh-token lifetime', () => {
    expect(() =>
      validateEnv({ ...validEnv, REFRESH_TOKEN_TTL_DAYS: '0' }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
    expect(() =>
      validateEnv({ ...validEnv, REFRESH_TOKEN_TTL_DAYS: 'forever' }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
  });

  it('rejects an unsupported SameSite value', () => {
    expect(() =>
      validateEnv({ ...validEnv, COOKIE_SAMESITE: 'weird' }),
    ).toThrow(/COOKIE_SAMESITE/);
  });

  it('accepts an explicit cookie security override', () => {
    const env = validateEnv({ ...validEnv, COOKIE_SECURE: 'true' });
    expect(env.COOKIE_SECURE).toBe('true');
  });

  it('defaults browser authentication off and does not require a CSRF secret', () => {
    const env = validateEnv({
      ...validEnv,
      ...validStorageEnv,
      NODE_ENV: 'production',
    });

    expect(env.BROWSER_AUTH_ENABLED).toBe('false');
    expect(env.CSRF_SECRET).toBeUndefined();
  });

  it('fails safely when browser authentication is enabled without a CSRF secret', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        ...validStorageEnv,
        NODE_ENV: 'production',
        BROWSER_AUTH_ENABLED: 'true',
      }),
    ).toThrow(/CSRF_SECRET/);
  });

  it('rejects a CSRF secret shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        BROWSER_AUTH_ENABLED: 'true',
        CSRF_SECRET: 'too-short',
      }),
    ).toThrow(/CSRF_SECRET/);
  });

  it('accepts browser authentication when a strong CSRF secret is present', () => {
    const env = validateEnv({
      ...validEnv,
      ...validStorageEnv,
      NODE_ENV: 'production',
      BROWSER_AUTH_ENABLED: 'true',
      CSRF_SECRET: 'c'.repeat(32),
    });

    expect(env.BROWSER_AUTH_ENABLED).toBe('true');
    expect(env.CSRF_SECRET).toBe('c'.repeat(32));
  });

  it('requires the storage block in production', () => {
    expect(() =>
      validateEnv({ ...validEnv, NODE_ENV: 'production' }),
    ).toThrow(/STORAGE_BUCKET/);
  });

  it('accepts a complete storage block in production', () => {
    const env = validateEnv({
      ...validEnv,
      ...validStorageEnv,
      NODE_ENV: 'production',
    });

    expect(env.STORAGE_BUCKET).toBe('knowledgehub-documents');
    expect(env.STORAGE_ENDPOINT).toBe('http://127.0.0.1:9000');
  });

  it('accepts a provider-shaped storage access key shorter than 32 characters', () => {
    const env = validateEnv({
      ...validEnv,
      STORAGE_ACCESS_KEY_ID: 'a'.repeat(20),
    });

    expect(env.STORAGE_ACCESS_KEY_ID).toBe('a'.repeat(20));
  });

  it('rejects an empty storage access key', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_ACCESS_KEY_ID: '' }),
    ).toThrow(/STORAGE_ACCESS_KEY_ID/);
  });

  it('rejects a storage secret access key shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_SECRET_ACCESS_KEY: 'b'.repeat(31) }),
    ).toThrow(/STORAGE_SECRET_ACCESS_KEY/);
  });

  it('rejects a malformed storage endpoint', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_ENDPOINT: 'not-a-url' }),
    ).toThrow(/STORAGE_ENDPOINT/);
  });

  it('rejects a storage endpoint that is not http or https', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_ENDPOINT: 'file:///tmp/storage' }),
    ).toThrow(/STORAGE_ENDPOINT/);
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_ENDPOINT: 'ftp://storage.test' }),
    ).toThrow(/STORAGE_ENDPOINT/);
  });

  it('accepts an https storage endpoint', () => {
    const env = validateEnv({
      ...validEnv,
      STORAGE_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
    });

    expect(env.STORAGE_ENDPOINT).toBe(
      'https://accountid.r2.cloudflarestorage.com',
    );
  });

  it('rejects an invalid storage path-style value', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_FORCE_PATH_STYLE: 'yes' }),
    ).toThrow(/STORAGE_FORCE_PATH_STYLE/);
  });

  it('rejects an invalid storage upload TTL', () => {
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_UPLOAD_TTL_SECONDS: '0' }),
    ).toThrow(/STORAGE_UPLOAD_TTL_SECONDS/);
    expect(() =>
      validateEnv({ ...validEnv, STORAGE_UPLOAD_TTL_SECONDS: 'soon' }),
    ).toThrow(/STORAGE_UPLOAD_TTL_SECONDS/);
  });

  it('rejects embedding dimensions that disagree with the stored vector column', () => {
    expect(() =>
      validateEnv({ ...validEnv, EMBEDDING_DIMENSIONS: '3072' }),
    ).toThrow(/EMBEDDING_DIMENSIONS/);
  });

  it('accepts the fixed embedding dimensions explicitly', () => {
    const env = validateEnv({ ...validEnv, EMBEDDING_DIMENSIONS: '1536' });

    expect(env.EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('requires an OpenAI key only when the processing worker is enabled', () => {
    expect(
      validateEnv({ ...validEnv, PROCESSING_WORKER_ENABLED: 'false' })
        .OPENAI_API_KEY,
    ).toBeUndefined();

    expect(() =>
      validateEnv({ ...validEnv, PROCESSING_WORKER_ENABLED: 'true' }),
    ).toThrow(/OPENAI_API_KEY/);

    expect(
      validateEnv({
        ...validEnv,
        PROCESSING_WORKER_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test',
      }).OPENAI_API_KEY,
    ).toBe('sk-test');
  });

  it('rejects a malformed OpenAI base URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, OPENAI_BASE_URL: 'not-a-url' }),
    ).toThrow(/OPENAI_BASE_URL/);
  });

  it('rejects an invalid embedding batch size', () => {
    expect(() =>
      validateEnv({ ...validEnv, EMBEDDING_BATCH_SIZE: '0' }),
    ).toThrow(/EMBEDDING_BATCH_SIZE/);
    expect(() =>
      validateEnv({ ...validEnv, EMBEDDING_BATCH_SIZE: 'many' }),
    ).toThrow(/EMBEDDING_BATCH_SIZE/);
  });

  it('coerces answer numeric strings', () => {
    const env = validateEnv({
      ...validEnv,
      ANSWER_TIMEOUT_MS: '45000',
      ANSWER_MAX_OUTPUT_TOKENS: '1024',
    });

    expect(env.ANSWER_TIMEOUT_MS).toBe(45000);
    expect(env.ANSWER_MAX_OUTPUT_TOKENS).toBe(1024);
  });

  it('rejects an empty answer model', () => {
    expect(() => validateEnv({ ...validEnv, ANSWER_MODEL: '' })).toThrow(
      /ANSWER_MODEL/,
    );
  });

  it('rejects an invalid answer timeout', () => {
    expect(() => validateEnv({ ...validEnv, ANSWER_TIMEOUT_MS: '0' })).toThrow(
      /ANSWER_TIMEOUT_MS/,
    );
    expect(() =>
      validateEnv({ ...validEnv, ANSWER_TIMEOUT_MS: 'soon' }),
    ).toThrow(/ANSWER_TIMEOUT_MS/);
  });

  it('rejects answer output tokens outside the supported range', () => {
    expect(() =>
      validateEnv({ ...validEnv, ANSWER_MAX_OUTPUT_TOKENS: '0' }),
    ).toThrow(/ANSWER_MAX_OUTPUT_TOKENS/);
    expect(() =>
      validateEnv({ ...validEnv, ANSWER_MAX_OUTPUT_TOKENS: '4097' }),
    ).toThrow(/ANSWER_MAX_OUTPUT_TOKENS/);
  });
});

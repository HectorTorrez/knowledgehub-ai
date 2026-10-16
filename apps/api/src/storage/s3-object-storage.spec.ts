import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3ObjectStorage } from './s3-object-storage.js';
import { StorageConfig } from './storage.config.js';

const { getSignedUrl } = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));

function storageConfig(overrides: Record<string, unknown> = {}): StorageConfig {
  const values: Record<string, unknown> = {
    STORAGE_BUCKET: 'knowledgehub-documents',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_REGION: 'auto',
    STORAGE_FORCE_PATH_STYLE: 'true',
    STORAGE_UPLOAD_TTL_SECONDS: 900,
    STORAGE_ACCESS_KEY_ID: 'a'.repeat(20),
    STORAGE_SECRET_ACCESS_KEY: 'b'.repeat(32),
    ...overrides,
  };

  const config = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  return new StorageConfig(config);
}

function createAdapter(
  overrides: Record<string, unknown> = {},
  client: S3Client = {} as S3Client,
) {
  return {
    client,
    adapter: new S3ObjectStorage(client, storageConfig(overrides)),
  };
}

const input = {
  key: 'organizations/org-1/documents/doc-1/2f1c',
  contentType: 'application/pdf',
  expiresInSeconds: 900,
};

describe('S3ObjectStorage.createPresignedUpload', () => {
  beforeEach(() => {
    getSignedUrl.mockReset();
    getSignedUrl.mockResolvedValue('https://storage.test/bucket/presigned');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the signed URL, PUT method and content-type header', async () => {
    const { adapter } = createAdapter();

    const result = await adapter.createPresignedUpload(input);

    expect(result).toEqual({
      url: 'https://storage.test/bucket/presigned',
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      expiresAt: expect.any(Date),
    });
  });

  it('binds the configured bucket, key and content type into the command', async () => {
    const { adapter } = createAdapter();

    await adapter.createPresignedUpload(input);

    const command = getSignedUrl.mock.calls[0][1] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'knowledgehub-documents',
      Key: 'organizations/org-1/documents/doc-1/2f1c',
      ContentType: 'application/pdf',
    });
  });

  it('uses the configured bucket rather than a hardcoded name', async () => {
    const { adapter } = createAdapter({ STORAGE_BUCKET: 'another-bucket' });

    await adapter.createPresignedUpload(input);

    const command = getSignedUrl.mock.calls[0][1] as PutObjectCommand;
    expect(command.input.Bucket).toBe('another-bucket');
  });

  it('passes the requested expiry to the presigner and signs the content type', async () => {
    const { adapter, client } = createAdapter();

    await adapter.createPresignedUpload({ ...input, expiresInSeconds: 120 });

    const [signedClient, , options] = getSignedUrl.mock.calls[0] as [
      S3Client,
      PutObjectCommand,
      { expiresIn: number; signableHeaders: Set<string> },
    ];
    expect(signedClient).toBe(client);
    expect(options.expiresIn).toBe(120);
    expect(options.signableHeaders).toEqual(new Set(['content-type']));
  });

  it('derives expiresAt from the requested expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { adapter } = createAdapter();

    const result = await adapter.createPresignedUpload({
      ...input,
      expiresInSeconds: 900,
    });

    expect(result.expiresAt.toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });

  it('propagates a presigner failure to the caller', async () => {
    getSignedUrl.mockRejectedValue(new Error('signing failed'));
    const { adapter } = createAdapter();

    await expect(adapter.createPresignedUpload(input)).rejects.toThrow(
      'signing failed',
    );
  });
});

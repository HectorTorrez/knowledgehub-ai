import type { S3Client } from '@aws-sdk/client-s3';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ObjectStorageIntegrityError,
  ObjectVersionMismatchError,
} from './object-storage.port.js';
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

function createSendingAdapter(overrides: Record<string, unknown> = {}) {
  const send = vi.fn();
  const client = { send } as unknown as S3Client;
  return {
    send,
    adapter: new S3ObjectStorage(client, storageConfig(overrides)),
  };
}

function awsError(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

function bodyOf(bytes: number[]): {
  transformToByteArray: () => Promise<Uint8Array>;
} {
  return { transformToByteArray: async () => new Uint8Array(bytes) };
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

describe('S3ObjectStorage.inspectObject', () => {
  it('issues a HeadObject for the configured bucket and key and maps the metadata', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({
      ContentLength: 1024,
      ContentType: 'application/pdf',
      ETag: '"version-1"',
    });

    const result = await adapter.inspectObject(input.key);

    expect(result).toEqual({
      key: input.key,
      sizeBytes: 1024,
      contentType: 'application/pdf',
      version: '"version-1"',
    });

    const command = send.mock.calls[0][0] as HeadObjectCommand;
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'knowledgehub-documents',
      Key: input.key,
    });
  });

  it('reports a missing content type as null', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({
      ContentLength: 4,
      ETag: '"version-1"',
    });

    const result = await adapter.inspectObject(input.key);

    expect(result?.contentType).toBeNull();
  });

  it('returns null when the object does not exist', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('NotFound', 404));

    await expect(adapter.inspectObject(input.key)).resolves.toBeNull();
  });

  it('returns null when the object is reported only by status', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('NoSuchKey', 404));

    await expect(adapter.inspectObject(input.key)).resolves.toBeNull();
  });

  it('propagates an unrelated provider failure', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('InternalError', 500));

    await expect(adapter.inspectObject(input.key)).rejects.toThrow(
      'InternalError',
    );
  });

  it('fails closed when the provider returns no version', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ContentLength: 10, ContentType: 'text/plain' });

    await expect(adapter.inspectObject(input.key)).rejects.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });

  it('fails closed when the provider returns no size', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ContentType: 'text/plain', ETag: '"version-1"' });

    await expect(adapter.inspectObject(input.key)).rejects.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });
});

describe('S3ObjectStorage.readObjectPrefix', () => {
  const read = { key: input.key, maxBytes: 1024, version: '"version-1"' };

  it('reads the prefix with a range and the version precondition', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: '"version-1"', Body: bodyOf([1, 2, 3]) });

    const bytes = await adapter.readObjectPrefix(read);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);

    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'knowledgehub-documents',
      Key: input.key,
      Range: 'bytes=0-1023',
      IfMatch: '"version-1"',
    });
  });

  it('accepts a version that differs only by ETag quoting', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: 'version-1', Body: bodyOf([1]) });

    const bytes = await adapter.readObjectPrefix(read);

    expect(Array.from(bytes)).toEqual([1]);
  });

  it('fails when the object was overwritten before the read', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('PreconditionFailed', 412));

    await expect(adapter.readObjectPrefix(read)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails when the object was deleted before the read', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('NoSuchKey', 404));

    await expect(adapter.readObjectPrefix(read)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails when the provider ignores the precondition and returns other bytes', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: '"version-2"', Body: bodyOf([9]) });

    await expect(adapter.readObjectPrefix(read)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails closed when the response carries no version', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ Body: bodyOf([1]) });

    await expect(adapter.readObjectPrefix(read)).rejects.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });

  it('fails closed when the response carries no body', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: '"version-1"' });

    await expect(adapter.readObjectPrefix(read)).rejects.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });

  it('rejects a non-positive prefix length before calling the provider', async () => {
    const { adapter, send } = createSendingAdapter();

    await expect(
      adapter.readObjectPrefix({ ...read, maxBytes: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('S3ObjectStorage.readObject', () => {
  const read = { key: input.key, version: '"version-1"' };

  it('reads the whole object with the version precondition and no range', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: '"version-1"', Body: bodyOf([1, 2, 3]) });

    const bytes = await adapter.readObject(read);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);

    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'knowledgehub-documents',
      Key: input.key,
      IfMatch: '"version-1"',
    });
  });

  it('fails when the object was overwritten before the read', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('PreconditionFailed', 412));

    await expect(adapter.readObject(read)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails when the provider ignores the precondition and returns other bytes', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ ETag: '"version-2"', Body: bodyOf([9]) });

    await expect(adapter.readObject(read)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });
});

describe('S3ObjectStorage.copyObject', () => {
  const copy = {
    sourceKey: 'organizations/org-1/documents/doc-1/2f1c',
    destinationKey: 'organizations/org-1/documents/doc-1/verified/9a0b',
    version: '"version-1"',
    contentType: 'application/pdf',
  };

  it('copies within the bucket, binding the source version', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ CopyObjectResult: { ETag: '"version-1"' } });

    await adapter.copyObject(copy);

    const command = send.mock.calls[0][0] as CopyObjectCommand;
    expect(command).toBeInstanceOf(CopyObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'knowledgehub-documents',
      Key: copy.destinationKey,
      CopySource: 'knowledgehub-documents/organizations%2Forg-1%2Fdocuments%2Fdoc-1%2F2f1c',
      CopySourceIfMatch: '"version-1"',
      MetadataDirective: 'REPLACE',
      ContentType: 'application/pdf',
    });
  });

  it('stamps the verified content type instead of inheriting the source metadata', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ CopyObjectResult: { ETag: '"version-1"' } });

    await adapter.copyObject({ ...copy, contentType: 'text/plain' });

    const command = send.mock.calls[0][0] as CopyObjectCommand;
    expect(command.input.MetadataDirective).toBe('REPLACE');
    expect(command.input.ContentType).toBe('text/plain');
  });

  it('accepts a copied version that differs only by ETag quoting', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ CopyObjectResult: { ETag: 'version-1' } });

    await expect(adapter.copyObject(copy)).resolves.toBeUndefined();
  });

  it('fails when the source was overwritten between the read and the copy', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('PreconditionFailed', 412));

    await expect(adapter.copyObject(copy)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails when the source no longer exists', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockRejectedValue(awsError('NoSuchKey', 404));

    await expect(adapter.copyObject(copy)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails when the provider ignores the precondition and copies other bytes', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({ CopyObjectResult: { ETag: '"version-2"' } });

    await expect(adapter.copyObject(copy)).rejects.toBeInstanceOf(
      ObjectVersionMismatchError,
    );
  });

  it('fails closed when the copy result carries no version', async () => {
    const { adapter, send } = createSendingAdapter();
    send.mockResolvedValue({});

    await expect(adapter.copyObject(copy)).rejects.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });
});

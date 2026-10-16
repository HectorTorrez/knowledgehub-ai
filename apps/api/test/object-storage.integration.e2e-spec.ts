import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ObjectVersionMismatchError } from '../src/storage/object-storage.port.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { StorageConfig } from '../src/storage/storage.config.js';

const runIntegration = process.env.STORAGE_INTEGRATION === 'true';

function integrationConfig(): StorageConfig {
  const values: Record<string, unknown> = {
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_REGION: process.env.STORAGE_REGION ?? 'auto',
    STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE ?? 'true',
    STORAGE_UPLOAD_TTL_SECONDS: 900,
    STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
  };

  const config = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  return new StorageConfig(config);
}

function integrationClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

describe.runIf(runIntegration)(
  'object storage integration against a real S3-compatible backend',
  () => {
    const config = integrationConfig();
    const client = integrationClient(config);
    const storage = new S3ObjectStorage(client, config);
    const namespace = `integration/${randomUUID()}`;
    const sourceKey = `${namespace}/source`;
    const verifiedKey = `${namespace}/verified/object`;

    async function upload(
      key: string,
      body: string,
      contentType: string,
    ): Promise<void> {
      const presigned = await storage.createPresignedUpload({
        key,
        contentType,
        expiresInSeconds: 900,
      });

      const response = await fetch(presigned.url, {
        method: 'PUT',
        headers: presigned.headers,
        body,
      });

      expect(response.ok).toBe(true);
    }

    it('inspects, reads a version-bound prefix, promotes and keeps the verified bytes immutable', async () => {
      const source = '%PDF-1.7\nreal bytes';
      await upload(sourceKey, source, 'application/pdf');

      const inspected = await storage.inspectObject(sourceKey);
      expect(inspected).not.toBeNull();
      expect(inspected?.sizeBytes).toBe(new TextEncoder().encode(source).byteLength);
      expect(inspected?.contentType).toBe('application/pdf');

      const prefix = await storage.readObjectPrefix({
        key: sourceKey,
        maxBytes: 1024,
        version: inspected?.version ?? '',
      });
      expect(new TextDecoder().decode(prefix)).toBe(source);

      await storage.copyObject({
        sourceKey,
        destinationKey: verifiedKey,
        version: inspected?.version ?? '',
        contentType: 'application/pdf',
      });

      const promoted = await storage.inspectObject(verifiedKey);
      expect(promoted?.sizeBytes).toBe(inspected?.sizeBytes);
      expect(promoted?.contentType).toBe('application/pdf');

      const promotedBytes = await storage.readObjectPrefix({
        key: verifiedKey,
        maxBytes: 1024,
        version: promoted?.version ?? '',
      });
      expect(new TextDecoder().decode(promotedBytes)).toBe(source);

      await upload(sourceKey, '%PDF-1.7\noverwritten bytes', 'application/pdf');

      const afterOverwrite = await storage.inspectObject(verifiedKey);
      const bytesAfterOverwrite = await storage.readObjectPrefix({
        key: verifiedKey,
        maxBytes: 1024,
        version: afterOverwrite?.version ?? '',
      });
      expect(new TextDecoder().decode(bytesAfterOverwrite)).toBe(source);
    });

    it('fails a stale version-bound read and copy', async () => {
      await upload(sourceKey, 'first revision', 'text/plain');
      const inspected = await storage.inspectObject(sourceKey);

      await upload(sourceKey, 'second revision', 'text/plain');

      await expect(
        storage.readObjectPrefix({
          key: sourceKey,
          maxBytes: 1024,
          version: inspected?.version ?? '',
        }),
      ).rejects.toBeInstanceOf(ObjectVersionMismatchError);

      await expect(
        storage.copyObject({
          sourceKey,
          destinationKey: verifiedKey,
          version: inspected?.version ?? '',
          contentType: 'text/plain',
        }),
      ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
    });

    it('reports a missing object as null', async () => {
      await expect(
        storage.inspectObject(`${namespace}/never-uploaded`),
      ).resolves.toBeNull();
    });

    it('cleans up the objects it created', async () => {
      for (const key of [sourceKey, verifiedKey]) {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
      }

      await expect(storage.inspectObject(sourceKey)).resolves.toBeNull();
      await expect(storage.inspectObject(verifiedKey)).resolves.toBeNull();
    });
  },
);

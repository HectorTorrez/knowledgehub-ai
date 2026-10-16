import { Inject, Injectable } from '@nestjs/common';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ObjectStorageIntegrityError,
  ObjectVersionMismatchError,
  type CopyObjectInput,
  type ObjectMetadata,
  type ObjectStorage,
  type PresignedUpload,
  type PresignedUploadInput,
  type ReadObjectInput,
  type ReadObjectPrefixInput,
} from './object-storage.port.js';
import { S3_CLIENT } from './s3-client.provider.js';
import { StorageConfig } from './storage.config.js';

const MS_PER_SECOND = 1_000;
const PRECONDITION_FAILED = 412;
const NOT_FOUND = 404;

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { name } = error as { name?: unknown };
  return typeof name === 'string' ? name : undefined;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;
  return typeof metadata?.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : undefined;
}

function isNotFound(error: unknown): boolean {
  const name = errorName(error);
  if (name === 'NotFound' || name === 'NoSuchKey') {
    return true;
  }
  return errorStatus(error) === NOT_FOUND;
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    errorName(error) === 'PreconditionFailed' ||
    errorStatus(error) === PRECONDITION_FAILED
  );
}

function isPortError(error: unknown): boolean {
  return (
    error instanceof ObjectVersionMismatchError ||
    error instanceof ObjectStorageIntegrityError
  );
}

function requireVersion(value: string | undefined, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ObjectStorageIntegrityError(
      `Object storage returned no version for key "${key}"`,
    );
  }
  return value;
}

function requireSize(value: number | undefined, key: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ObjectStorageIntegrityError(
      `Object storage returned no usable size for key "${key}"`,
    );
  }
  return value;
}

function normalizeVersion(value: string): string {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '');
}

function sameVersion(left: string, right: string): boolean {
  return normalizeVersion(left) === normalizeVersion(right);
}

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    private readonly config: StorageConfig,
  ) {}

  async createPresignedUpload(
    input: PresignedUploadInput,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set(['content-type']),
    });

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(
        Date.now() + input.expiresInSeconds * MS_PER_SECOND,
      ),
    };
  }

  async inspectObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );

      return {
        key,
        sizeBytes: requireSize(head.ContentLength, key),
        contentType: head.ContentType ?? null,
        version: requireVersion(head.ETag, key),
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async readObjectPrefix(input: ReadObjectPrefixInput): Promise<Uint8Array> {
    const { key, maxBytes, version } = input;

    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
      throw new RangeError('maxBytes must be a positive integer');
    }

    return this.readObjectBytes(key, version, `bytes=0-${maxBytes - 1}`);
  }

  async readObject(input: ReadObjectInput): Promise<Uint8Array> {
    return this.readObjectBytes(input.key, input.version);
  }

  private async readObjectBytes(
    key: string,
    version: string,
    range?: string,
  ): Promise<Uint8Array> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          ...(range ? { Range: range } : {}),
          IfMatch: version,
        }),
      );

      const returnedVersion = requireVersion(object.ETag, key);
      if (!sameVersion(returnedVersion, version)) {
        throw new ObjectVersionMismatchError();
      }
      if (!object.Body) {
        throw new ObjectStorageIntegrityError(
          `Object storage returned no body for key "${key}"`,
        );
      }

      return await object.Body.transformToByteArray();
    } catch (error) {
      if (isPortError(error)) {
        throw error;
      }
      if (isPreconditionFailed(error) || isNotFound(error)) {
        throw new ObjectVersionMismatchError(undefined, { cause: error });
      }
      throw error;
    }
  }

  async copyObject(input: CopyObjectInput): Promise<void> {
    const { sourceKey, destinationKey, version, contentType } = input;

    try {
      const result = await this.client.send(
        new CopyObjectCommand({
          Bucket: this.config.bucket,
          Key: destinationKey,
          CopySource: `${this.config.bucket}/${encodeURIComponent(sourceKey)}`,
          CopySourceIfMatch: version,
          MetadataDirective: 'REPLACE',
          ContentType: contentType,
        }),
      );

      const copiedVersion = requireVersion(
        result.CopyObjectResult?.ETag,
        destinationKey,
      );
      if (!sameVersion(copiedVersion, version)) {
        throw new ObjectVersionMismatchError();
      }
    } catch (error) {
      if (isPortError(error)) {
        throw error;
      }
      if (isPreconditionFailed(error) || isNotFound(error)) {
        throw new ObjectVersionMismatchError(undefined, { cause: error });
      }
      throw error;
    }
  }
}

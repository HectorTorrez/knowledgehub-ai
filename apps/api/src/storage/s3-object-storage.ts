import { Inject, Injectable } from '@nestjs/common';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ObjectStorage,
  PresignedUpload,
  PresignedUploadInput,
} from './object-storage.port.js';
import { S3_CLIENT } from './s3-client.provider.js';
import { StorageConfig } from './storage.config.js';

const MS_PER_SECOND = 1_000;

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
}

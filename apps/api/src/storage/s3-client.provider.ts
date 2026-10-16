import { S3Client } from '@aws-sdk/client-s3';
import type { Provider } from '@nestjs/common';
import { StorageConfig } from './storage.config.js';

export const S3_CLIENT = Symbol('S3_CLIENT');

export const s3ClientProvider: Provider = {
  provide: S3_CLIENT,
  inject: [StorageConfig],
  useFactory: (config: StorageConfig): S3Client =>
    new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
};

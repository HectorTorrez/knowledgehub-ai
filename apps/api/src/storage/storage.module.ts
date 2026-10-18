import { Module } from '@nestjs/common';
import { OBJECT_STORAGE } from './object-storage.port.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import { s3ClientProvider } from './s3-client.provider.js';
import { StorageConfig } from './storage.config.js';
import { StorageSweepService } from './storage-sweep.service.js';

@Module({
  providers: [
    StorageConfig,
    s3ClientProvider,
    StorageSweepService,
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
  ],
  exports: [OBJECT_STORAGE, StorageConfig],
})
export class StorageModule {}

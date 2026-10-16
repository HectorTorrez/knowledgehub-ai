import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageConfig {
  constructor(private readonly config: ConfigService) {}

  get bucket(): string {
    return this.config.getOrThrow<string>('STORAGE_BUCKET');
  }

  get endpoint(): string {
    return this.config.getOrThrow<string>('STORAGE_ENDPOINT');
  }

  get region(): string {
    return this.config.getOrThrow<string>('STORAGE_REGION');
  }

  get forcePathStyle(): boolean {
    return this.config.getOrThrow<string>('STORAGE_FORCE_PATH_STYLE') === 'true';
  }

  get uploadTtlSeconds(): number {
    return this.config.getOrThrow<number>('STORAGE_UPLOAD_TTL_SECONDS');
  }

  get accessKeyId(): string {
    return this.config.getOrThrow<string>('STORAGE_ACCESS_KEY_ID');
  }

  get secretAccessKey(): string {
    return this.config.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY');
  }
}

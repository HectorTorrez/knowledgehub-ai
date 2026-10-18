import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.port.js';
import { StorageConfig } from './storage.config.js';

const VERIFIED_SEGMENT = '/verified/';
const LIST_PREFIX = 'organizations/';

@Injectable()
export class StorageSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageSweepService.name);
  private running = false;
  private currentRun: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private wakeTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly prisma: PrismaService,
    private readonly config: StorageConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.sweepEnabled) {
      return;
    }

    this.running = true;
    this.currentRun = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }

    this.wake?.();
    this.wake = null;

    await this.currentRun;
  }

  async sweepOnce(): Promise<number> {
    const referenced = await this.referencedVerifiedKeys();
    const cutoffMs = Date.now() - this.config.sweepGraceMs;
    let deleted = 0;

    for await (const object of this.storage.listObjects(LIST_PREFIX)) {
      if (!object.key.includes(VERIFIED_SEGMENT)) {
        continue;
      }

      if (referenced.has(object.key)) {
        continue;
      }

      if (object.lastModifiedMs >= cutoffMs) {
        continue;
      }

      await this.storage.deleteObject(object.key);
      deleted += 1;
    }

    return deleted;
  }

  private async referencedVerifiedKeys(): Promise<Set<string>> {
    const rows = await this.prisma.document.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    });

    return new Set(
      rows
        .map((row) => row.storageKey)
        .filter((key): key is string => key !== null),
    );
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.sweepOnce();
      } catch (error) {
        this.logger.error('Storage sweep iteration failed', error);
      }

      await this.waitForNext();
    }
  }

  private waitForNext(): Promise<void> {
    return new Promise((resolve) => {
      this.wake = resolve;
      this.wakeTimer = setTimeout(() => {
        this.wake = null;
        this.wakeTimer = null;
        resolve();
      }, this.config.sweepIntervalMs);
      this.wakeTimer.unref();
    });
  }
}

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { FactsConfig } from './facts.config.js';
import { FactsService } from './facts.service.js';
import { FactsStore } from './facts.store.js';

@Injectable()
export class FactsBackfillService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FactsBackfillService.name);
  private running = false;
  private currentRun: Promise<void> | null = null;

  constructor(
    private readonly config: FactsConfig,
    private readonly store: FactsStore,
    private readonly facts: FactsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled || !this.config.backfillEnabled) {
      return;
    }

    this.running = true;
    this.currentRun = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.currentRun;
  }

  async runOnce(): Promise<number> {
    const documents = await this.store.nextPending(this.config.backfillBatch);

    for (const document of documents) {
      const pages = await this.store.loadPages(
        document.organizationId,
        document.id,
        document.generation,
      );

      if (pages.length === 0) {
        await this.store.markFailed(
          {
            organizationId: document.organizationId,
            documentId: document.id,
            documentGeneration: document.generation,
          },
          'MissingExtraction',
        );
        continue;
      }

      const chunks = await this.store.loadChunks(
        document.organizationId,
        document.id,
        document.generation,
      );

      await this.facts.extractForDocument(
        {
          organizationId: document.organizationId,
          documentId: document.id,
          documentGeneration: document.generation,
        },
        pages,
        chunks,
      );
    }

    return documents.length;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.runOnce();

        if (processed === 0) {
          return;
        }
      } catch (error) {
        this.logger.error('Fact backfill iteration failed', error);
        return;
      }
    }
  }
}

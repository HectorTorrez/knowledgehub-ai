import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FactsTarget, StoredChunk } from '../facts/facts.store.js';
import { FactsStore } from '../facts/facts.store.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { summaryInput } from './summary-input.js';
import { SUMMARIZER, type Summarizer } from './summarizer.js';

@Injectable()
export class SummariesService implements OnModuleInit {
  private readonly logger = new Logger(SummariesService.name);
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly factsStore: FactsStore, @Inject(SUMMARIZER) private readonly summarizer: Summarizer) {}

  onModuleInit(): void {
    if (this.config.get<string>('SUMMARIES_ENABLED') !== 'false') void this.backfill();
  }

  async summarize(target: FactsTarget, chunks: StoredChunk[]): Promise<void> {
    if (this.config.get<string>('SUMMARIES_ENABLED') === 'false') return;
    try {
      const text = summaryInput(chunks, this.config.get<number>('SUMMARY_INPUT_MAX_CHARS') ?? 40000);
      if (!text.trim()) throw new Error('MissingChunks');
      const result = await this.summarizer.summarize(text);
      await this.prisma.$transaction(async (tx) => {
        const owned = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Document" WHERE id = ${target.documentId}::uuid AND "organizationId" = ${target.organizationId}::uuid AND generation = ${target.documentGeneration} AND status = 'READY' FOR UPDATE`;
        if (!owned.length) return;
        await tx.documentSummary.upsert({ where: { documentId_documentGeneration: { documentId: target.documentId, documentGeneration: target.documentGeneration } }, create: { ...target, ...result, model: this.config.get<string>('SUMMARY_MODEL') ?? this.config.getOrThrow<string>('ANSWER_MODEL') }, update: { ...result, model: this.config.get<string>('SUMMARY_MODEL') ?? this.config.getOrThrow<string>('ANSWER_MODEL') } });
        await tx.document.updateMany({ where: { id: target.documentId, organizationId: target.organizationId, generation: target.documentGeneration }, data: { summaryStatus: 'READY', summaryFailureReason: null } });
      });
    } catch (error) {
      this.logger.warn(`Summary failed for document ${target.documentId}`);
      try {
        await this.prisma.document.updateMany({ where: { id: target.documentId, organizationId: target.organizationId, generation: target.documentGeneration, status: 'READY', summaryStatus: { not: 'READY' } }, data: { summaryStatus: 'FAILED', summaryFailureReason: error instanceof Error ? error.name : 'UnknownError' } });
      } catch (recordError) { this.logger.warn('Could not record summary failure', recordError); }
    }
  }

  private async backfill(): Promise<void> {
    try {
      for (;;) {
        const documents = await this.prisma.document.findMany({ where: { status: 'READY', summaryStatus: 'PENDING' }, select: { id: true, organizationId: true, generation: true }, take: 5 });
        if (!documents.length) return;
        for (const document of documents) await this.summarize({ documentId: document.id, organizationId: document.organizationId, documentGeneration: document.generation }, await this.factsStore.loadChunks(document.id, document.generation));
      }
    } catch (error) { this.logger.warn('Summary backfill failed', error); }
  }
}

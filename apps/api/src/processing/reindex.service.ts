import { Injectable } from '@nestjs/common';
import { PROCESSING_MAX_ATTEMPTS } from '../documents/processing-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHUNKING_VERSION } from './chunking.policy.js';

interface Candidate {
  id: string;
  organizationId: string;
  generation: number;
  storageKey: string;
}

@Injectable()
export class ReindexService {
  constructor(private readonly prisma: PrismaService) {}

  async run(options: {
    organizationId?: string;
    dryRun?: boolean;
  }): Promise<number> {
    let cursor = '00000000-0000-0000-0000-000000000000';
    let count = 0;
    for (;;) {
      const candidates = await this.prisma.$queryRaw<Candidate[]>`
        SELECT d.id, d."organizationId", d.generation, d."storageKey"
        FROM "Document" d
        JOIN "DocumentExtraction" e ON e."documentId" = d.id
          AND e."documentGeneration" = d.generation
          AND e."organizationId" = d."organizationId"
        WHERE d.status = 'READY' AND d."storageKey" IS NOT NULL
          AND e."chunkingVersion" < ${CHUNKING_VERSION}
          AND d.id > ${cursor}::uuid
          AND (${options.organizationId ?? null}::uuid IS NULL OR d."organizationId" = ${options.organizationId ?? null}::uuid)
        ORDER BY d.id LIMIT 100`;
      if (!candidates.length) return count;
      for (const document of candidates) {
        cursor = document.id;
        if (options.dryRun) {
          count++;
          continue;
        }
        const queued = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.document.updateMany({
            where: {
              id: document.id,
              organizationId: document.organizationId,
              generation: document.generation,
              status: 'READY',
              storageKey: document.storageKey,
            },
            data: {
              status: 'PROCESSING',
              generation: { increment: 1 },
              failureReason: null,
              failureKind: null,
            },
          });
          if (!updated.count) return false;
          await tx.documentProcessingJob.create({
            data: {
              documentId: document.id,
              organizationId: document.organizationId,
              documentGeneration: document.generation + 1,
              verifiedStorageKey: document.storageKey,
              state: 'QUEUED',
              attempt: 0,
              maxAttempts: PROCESSING_MAX_ATTEMPTS,
            },
          });
          return true;
        });
        if (queued) count++;
      }
    }
  }
}

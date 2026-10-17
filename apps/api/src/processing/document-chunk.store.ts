import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EMBEDDING_PROVIDER,
  EmbeddingRejectedError,
  EmbeddingResponseError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DocumentChunkDraft } from './chunking.policy.js';
import type { ProcessingOwnership } from './processing-job.service.js';

interface OwnedGeneration {
  documentId: string;
  organizationId: string;
  documentGeneration: number;
}

interface QueryClient {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

interface CommandClient {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

@Injectable()
export class DocumentChunkStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingConfig: EmbeddingConfig,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async replaceForGeneration(
    ownership: ProcessingOwnership,
    chunks: DocumentChunkDraft[],
  ): Promise<boolean> {
    const preview = await this.selectOwnedGeneration(this.prisma, ownership, false);
    if (!preview) {
      return false;
    }

    if (chunks.some((chunk) => chunk.content.trim().length === 0)) {
      throw new EmbeddingRejectedError('A chunk has no text to embed');
    }

    const vectors = await this.embeddings.embed(
      chunks.map((chunk) => chunk.content),
    );
    this.assertStorableVectors(vectors, chunks.length);

    return this.prisma.$transaction(async (tx) => {
      const owned = await this.selectOwnedGeneration(tx, ownership, true);
      if (!owned) {
        return false;
      }

      await this.writeGeneration(tx, owned, chunks, vectors);
      return true;
    });
  }

  private assertStorableVectors(vectors: number[][], expectedCount: number): void {
    const dimensions = this.embeddingConfig.dimensions;

    if (vectors.length !== expectedCount) {
      throw new EmbeddingResponseError(
        `The embedding provider returned ${vectors.length} embeddings for ${expectedCount} chunks`,
      );
    }

    for (const vector of vectors) {
      if (vector.length !== dimensions) {
        throw new EmbeddingResponseError(
          `The embedding provider returned a vector that is not ${dimensions} dimensions`,
        );
      }

      if (vector.some((value) => !Number.isFinite(value))) {
        throw new EmbeddingResponseError(
          'The embedding provider returned a non-finite vector value',
        );
      }
    }
  }

  private async selectOwnedGeneration(
    client: QueryClient,
    ownership: ProcessingOwnership,
    lock: boolean,
  ): Promise<OwnedGeneration | null> {
    const rows = lock
      ? await client.$queryRaw<OwnedGeneration[]>`
          SELECT j."documentId", j."organizationId", j."documentGeneration"
          FROM "DocumentProcessingJob" AS j
          JOIN "Document" AS d ON d.id = j."documentId"
          WHERE j.id = ${ownership.jobId}::uuid
            AND j.state = 'CLAIMED'
            AND j."leaseId" = ${ownership.leaseId}::uuid
            AND j."leaseExpiresAt" > now()
            AND j."organizationId" = ${ownership.organizationId}::uuid
            AND j."documentGeneration" = ${ownership.documentGeneration}
            AND j."verifiedStorageKey" = ${ownership.verifiedStorageKey}
            AND d."organizationId" = ${ownership.organizationId}::uuid
            AND d."generation" = ${ownership.documentGeneration}
            AND d."storageKey" = ${ownership.verifiedStorageKey}
            AND d.status = 'PROCESSING'
          FOR UPDATE OF j, d
        `
      : await client.$queryRaw<OwnedGeneration[]>`
          SELECT j."documentId", j."organizationId", j."documentGeneration"
          FROM "DocumentProcessingJob" AS j
          JOIN "Document" AS d ON d.id = j."documentId"
          WHERE j.id = ${ownership.jobId}::uuid
            AND j.state = 'CLAIMED'
            AND j."leaseId" = ${ownership.leaseId}::uuid
            AND j."leaseExpiresAt" > now()
            AND j."organizationId" = ${ownership.organizationId}::uuid
            AND j."documentGeneration" = ${ownership.documentGeneration}
            AND j."verifiedStorageKey" = ${ownership.verifiedStorageKey}
            AND d."organizationId" = ${ownership.organizationId}::uuid
            AND d."generation" = ${ownership.documentGeneration}
            AND d."storageKey" = ${ownership.verifiedStorageKey}
            AND d.status = 'PROCESSING'
        `;

    return rows[0] ?? null;
  }

  private async writeGeneration(
    client: CommandClient,
    owned: OwnedGeneration,
    chunks: DocumentChunkDraft[],
    vectors: number[][],
  ): Promise<void> {
    await client.$executeRaw`
      DELETE FROM "DocumentChunk"
      WHERE "documentId" = ${owned.documentId}::uuid
        AND "organizationId" = ${owned.organizationId}::uuid
        AND "documentGeneration" = ${owned.documentGeneration}
    `;

    for (const [index, chunk] of chunks.entries()) {
      await client.$executeRaw`
        INSERT INTO "DocumentChunk"
          ("id", "documentId", "organizationId", "documentGeneration",
           "pageNumber", "chunkIndex", "content", "characterCount",
           "embedding", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${owned.documentId}::uuid,
          ${owned.organizationId}::uuid,
          ${owned.documentGeneration},
          ${chunk.pageNumber},
          ${chunk.chunkIndex},
          ${chunk.content},
          ${chunk.characterCount},
          ${vectorLiteral(vectors[index]!)}::vector,
          now(),
          now()
        )
      `;
    }
  }
}

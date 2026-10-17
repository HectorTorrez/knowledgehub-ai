import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EMBEDDING_PROVIDER,
  EmbeddingResponseError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  assertRetrievalQuery,
} from './retrieval-policy.js';

export interface RetrievalQuery {
  organizationId: string;
  text: string;
  limit?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  similarity: number;
}

interface ChunkMatchRow {
  chunkId: string;
  documentId: string;
  title: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  similarity: number;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingConfig: EmbeddingConfig,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async search(query: RetrievalQuery): Promise<RetrievedChunk[]> {
    const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
    assertRetrievalQuery(query.text, limit);

    const vector = await this.embedQuery(query.text);

    const rows = await this.prisma.$queryRaw<ChunkMatchRow[]>`
      SELECT
        c.id AS "chunkId",
        c."documentId" AS "documentId",
        d.title AS "title",
        c."pageNumber" AS "pageNumber",
        c."chunkIndex" AS "chunkIndex",
        c.content AS "content",
        (1 - (c."embedding" <=> ${vectorLiteral(vector)}::vector)) AS "similarity"
      FROM "DocumentChunk" AS c
      JOIN "Document" AS d ON d.id = c."documentId"
      WHERE c."organizationId" = ${query.organizationId}::uuid
        AND d."organizationId" = ${query.organizationId}::uuid
        AND d.status = 'READY'
        AND d.generation = c."documentGeneration"
      ORDER BY c."embedding" <=> ${vectorLiteral(vector)}::vector,
               c."documentId",
               c."chunkIndex"
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      title: row.title,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      content: row.content,
      similarity: row.similarity,
    }));
  }

  private async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embeddings.embed([text]);

    if (
      !vector ||
      vector.length !== this.embeddingConfig.dimensions ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new EmbeddingResponseError(
        'The embedding provider did not return a usable query vector',
      );
    }

    return vector;
  }
}

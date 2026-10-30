import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EMBEDDING_PROVIDER,
  EmbeddingResponseError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  RETRIEVAL_CANDIDATE_LIMIT,
  assertRetrievalQuery,
} from './retrieval-policy.js';
import { fuseRanks } from './rank-fusion.js';

export interface RetrievalQuery {
  organizationId: string;
  text: string;
  limit?: number;
  documentId?: string;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  similarity: number;
  lexicalMatch: boolean;
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

    const documentFilter = query.documentId
      ? Prisma.sql`AND c."documentId" = ${query.documentId}::uuid`
      : Prisma.empty;
    const vectorValue = vectorLiteral(vector);
    const base = Prisma.sql`
      SELECT c.id AS "chunkId", c."documentId" AS "documentId",
        d.title AS "title", c."pageNumber" AS "pageNumber",
        c."chunkIndex" AS "chunkIndex", c.content AS "content",
        (1 - (c."embedding" <=> ${vectorValue}::vector)) AS "similarity"
      FROM "DocumentChunk" AS c
      JOIN "Document" AS d ON d.id = c."documentId"
      WHERE c."organizationId" = ${query.organizationId}::uuid
        AND d."organizationId" = ${query.organizationId}::uuid
        AND d.status = 'READY'
        AND d.generation = c."documentGeneration"
        ${documentFilter}
    `;
    const anyTermQuery = Prisma.sql`to_tsquery('simple', array_to_string(tsvector_to_array(to_tsvector('simple', ${query.text})), ' | '))`;
    const candidateLimit = Math.max(limit, RETRIEVAL_CANDIDATE_LIMIT);
    const [vectorRows, lexicalRows] = await Promise.all([
      this.prisma.$queryRaw<ChunkMatchRow[]>(Prisma.sql`${base}
        ORDER BY c."embedding" <=> ${vectorValue}::vector, c.id
        LIMIT ${candidateLimit}`),
      this.prisma.$queryRaw<ChunkMatchRow[]>(Prisma.sql`${base}
        AND c."searchVector" @@ ${anyTermQuery}
        ORDER BY ts_rank_cd(c."searchVector", ${anyTermQuery}) DESC, c.id
        LIMIT ${candidateLimit}`),
    ]);
    const lexicalIds = new Set(lexicalRows.map((row) => row.chunkId));

    return fuseRanks([vectorRows, lexicalRows])
      .slice(0, limit)
      .map((row) => ({ ...row, lexicalMatch: lexicalIds.has(row.chunkId) }));
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

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { fuseRanks } from './rank-fusion.js';
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
  relevance: number;
  matchedLexically: boolean;
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
    const filter = Prisma.sql`
      c."organizationId" = ${query.organizationId}::uuid
      AND d."organizationId" = ${query.organizationId}::uuid
      AND d.status = 'READY'
      AND d.generation = c."documentGeneration"
      ${documentFilter}
    `;
    const fields = Prisma.sql`
      c.id AS "chunkId", c."documentId", d.title, c."pageNumber",
      c."chunkIndex", c.content,
      (1 - (c."embedding" <=> ${vectorLiteral(vector)}::vector)) AS similarity
    `;
    const [vectorRows, lexicalRows] = await Promise.all([
      this.prisma.$queryRaw<ChunkMatchRow[]>(Prisma.sql`
        SELECT ${fields} FROM "DocumentChunk" c
        JOIN "Document" d ON d.id = c."documentId"
        WHERE ${filter}
        ORDER BY c."embedding" <=> ${vectorLiteral(vector)}::vector, c.id
        LIMIT ${Math.max(40, limit)}
      `),
      this.prisma.$queryRaw<ChunkMatchRow[]>(Prisma.sql`
        SELECT ${fields} FROM "DocumentChunk" c
        JOIN "Document" d ON d.id = c."documentId"
        WHERE ${filter}
          AND c."searchVector" @@ websearch_to_tsquery('simple', ${query.text})
        ORDER BY ts_rank_cd(c."searchVector", websearch_to_tsquery('simple', ${query.text})) DESC, c.id
        LIMIT ${Math.max(40, limit)}
      `),
    ]);
    return fuseRanks(vectorRows, lexicalRows).slice(0, limit);
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

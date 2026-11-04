import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SearchResponse } from '@knowledgehub/shared-types';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import {
  RetrievalService,
  type RetrievedChunk,
} from '../retrieval/retrieval.service.js';
import {
  MAX_RETRIEVAL_LIMIT,
  RetrievalQueryError,
} from '../retrieval/retrieval-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveCollectionScope } from '../collections/resolve-collection-scope.js';
import { groupSearchResults } from './search-results.js';
import type { SearchInput } from './dto/search.schema.js';

function withCause<T extends Error>(exception: T, cause: unknown): T {
  exception.cause = cause;
  return exception;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly prisma: PrismaService,
  ) {}

  async search(
    organizationId: string,
    input: SearchInput,
  ): Promise<SearchResponse> {
    const documentIds = input.collectionIds
      ? await resolveCollectionScope(
          this.prisma,
          organizationId,
          input.collectionIds,
          input.documentIds,
        )
      : input.documentIds;
    if (documentIds && documentIds.length === 0) return { results: [] };
    let chunks: RetrievedChunk[];

    try {
      chunks = await this.retrieval.search({
        organizationId,
        text: input.q,
        limit: Math.min(input.limit * 5, MAX_RETRIEVAL_LIMIT),
        ...(input.documentId ? { documentId: input.documentId } : {}),
        ...(documentIds ? { documentIds } : {}),
        ...(input.createdAfter ? { createdAfter: input.createdAfter } : {}),
        ...(input.createdBefore ? { createdBefore: input.createdBefore } : {}),
      });
    } catch (error) {
      throw mapSearchError(error);
    }

    return { results: groupSearchResults(chunks, input.q, input.limit) };
  }
}

function mapSearchError(error: unknown): Error {
  if (error instanceof RetrievalQueryError) {
    return new BadRequestException('The search query is not valid');
  }

  if (error instanceof EmbeddingUnavailableError) {
    return withCause(
      new ServiceUnavailableException(
        'The search service is temporarily unavailable',
      ),
      error,
    );
  }

  if (
    error instanceof EmbeddingRejectedError ||
    error instanceof EmbeddingResponseError
  ) {
    return withCause(
      new BadGatewayException(
        'The retrieval provider returned an unusable response',
      ),
      error,
    );
  }

  return error instanceof Error ? error : new Error('The search step failed');
}

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SearchResponse, SearchResult } from '@knowledgehub/shared-types';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import {
  RetrievalService,
  type RetrievedChunk,
} from '../retrieval/retrieval.service.js';
import { RetrievalQueryError } from '../retrieval/retrieval-policy.js';
import type { SearchInput } from './dto/search.schema.js';

function withCause<T extends Error>(exception: T, cause: unknown): T {
  exception.cause = cause;
  return exception;
}

function toSearchResult(chunk: RetrievedChunk): SearchResult {
  return {
    documentId: chunk.documentId,
    documentTitle: chunk.title,
    pageNumber: chunk.pageNumber,
    chunkIndex: chunk.chunkIndex,
    excerpt: chunk.content,
    score: chunk.similarity,
  };
}

@Injectable()
export class SearchService {
  constructor(private readonly retrieval: RetrievalService) {}

  async search(
    organizationId: string,
    input: SearchInput,
  ): Promise<SearchResponse> {
    let chunks: RetrievedChunk[];

    try {
      chunks = await this.retrieval.search({
        organizationId,
        text: input.q,
        limit: input.limit,
      });
    } catch (error) {
      throw mapSearchError(error);
    }

    return { results: chunks.map(toSearchResult) };
  }
}

function mapSearchError(error: unknown): Error {
  if (error instanceof RetrievalQueryError) {
    return new BadRequestException('The search query is not valid');
  }

  if (error instanceof EmbeddingUnavailableError) {
    return withCause(
      new ServiceUnavailableException('The search service is temporarily unavailable'),
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

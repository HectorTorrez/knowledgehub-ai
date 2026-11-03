import type { SearchResponse } from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

export interface SearchOptions extends RequestOptions {
  limit?: number;
  documentId?: string;
  documentIds?: string[];
  collectionIds?: string[];
  createdAfter?: string;
  createdBefore?: string;
}

export const searchApi = {
  search(
    organizationId: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.documentId) {
      params.set('documentId', options.documentId);
    }

    for (const id of options.collectionIds ?? []) params.append('collectionIds', id);
    for (const id of options.documentIds ?? []) params.append('documentIds', id);
    if (options.createdAfter) params.set('createdAfter', options.createdAfter);
    if (options.createdBefore) params.set('createdBefore', options.createdBefore);

    return apiFetch<SearchResponse>(
      `/organizations/${organizationId}/search?${params.toString()}`,
      { authRecovery: true, signal: options.signal },
    );
  },
};

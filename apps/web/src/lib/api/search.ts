import type { SearchResponse } from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

export interface SearchOptions extends RequestOptions {
  limit?: number;
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

    return apiFetch<SearchResponse>(
      `/organizations/${organizationId}/search?${params.toString()}`,
      { authRecovery: true, signal: options.signal },
    );
  },
};

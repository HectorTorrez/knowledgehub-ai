import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

export interface ContractTotalsOptions extends RequestOptions {
  documentId?: string;
  currency?: string;
  limit?: number;
  offset?: number;
}

export const aggregationApi = {
  contractTotals(
    organizationId: string,
    options: ContractTotalsOptions = {},
  ): Promise<ContractTotalsResponse> {
    const params = new URLSearchParams();

    if (options.documentId) {
      params.set('documentId', options.documentId);
    }
    if (options.currency) {
      params.set('currency', options.currency);
    }
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.offset !== undefined) {
      params.set('offset', String(options.offset));
    }

    const query = params.toString();

    return apiFetch<ContractTotalsResponse>(
      `/organizations/${organizationId}/aggregates/contract-totals${query ? `?${query}` : ''}`,
      { authRecovery: true, signal: options.signal },
    );
  },
};

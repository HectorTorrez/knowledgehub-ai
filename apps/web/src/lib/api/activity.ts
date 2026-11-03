import type { OrganizationActivityListResponse } from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export const activityApi = {
  list(organizationId: string, options: { cursor?: string; limit?: number } = {}): Promise<OrganizationActivityListResponse> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    const query = params.toString();
    return apiFetch<OrganizationActivityListResponse>(
      `/organizations/${organizationId}/activity${query ? `?${query}` : ''}`,
      { authRecovery: true },
    );
  },
};

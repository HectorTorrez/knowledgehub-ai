import type { KnowledgeInsightsResponse } from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export function getInsights(organizationId: string, days: number): Promise<KnowledgeInsightsResponse> {
  return apiFetch(`/organizations/${organizationId}/insights?days=${days}`, { authRecovery: true });
}

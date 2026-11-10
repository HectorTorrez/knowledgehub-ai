import type {
  KnowledgeGapTask,
  UpdateKnowledgeGapRequest,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export const knowledgeGapsApi = {
  list(organizationId: string): Promise<{ tasks: KnowledgeGapTask[] }> {
    return apiFetch(`/organizations/${organizationId}/knowledge-gaps`, {
      authRecovery: true,
    });
  },
  save(
    organizationId: string,
    answerId: string,
    body: UpdateKnowledgeGapRequest,
  ): Promise<void> {
    return apiFetch(
      `/organizations/${organizationId}/knowledge-gaps/${answerId}`,
      { method: 'PUT', body, authRecovery: true },
    );
  },
};

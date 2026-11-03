import type { Collection } from '@knowledgehub/shared-types';
import { apiFetch } from './client';

function path(organizationId: string) {
  return `/organizations/${organizationId}/collections`;
}

export const collectionsApi = {
  list(organizationId: string): Promise<Collection[]> {
    return apiFetch(path(organizationId), { authRecovery: true });
  },
  create(organizationId: string, input: { name: string; color: string }): Promise<Collection> {
    return apiFetch(path(organizationId), { method: 'POST', body: input, authRecovery: true });
  },
  update(organizationId: string, id: string, input: { name?: string; color?: string }): Promise<Collection> {
    return apiFetch(`${path(organizationId)}/${id}`, { method: 'PATCH', body: input, authRecovery: true });
  },
  remove(organizationId: string, id: string): Promise<void> {
    return apiFetch(`${path(organizationId)}/${id}`, { method: 'DELETE', authRecovery: true });
  },
  setDocumentCollections(organizationId: string, documentId: string, collectionIds: string[]): Promise<void> {
    return apiFetch(`/organizations/${organizationId}/documents/${documentId}/collections`, {
      method: 'PUT', body: { collectionIds }, authRecovery: true,
    });
  },
};

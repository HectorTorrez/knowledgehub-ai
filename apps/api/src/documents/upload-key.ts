import { randomUUID } from 'node:crypto';

export function createDocumentStorageKey(
  organizationId: string,
  documentId: string,
  token: string = randomUUID(),
): string {
  return `organizations/${organizationId}/documents/${documentId}/${token}`;
}

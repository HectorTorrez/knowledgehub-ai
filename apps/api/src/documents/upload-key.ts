import { randomUUID } from 'node:crypto';

function documentPrefix(
  organizationId: string,
  documentId: string,
): string {
  return `organizations/${organizationId}/documents/${documentId}`;
}

export function createDocumentStorageKey(
  organizationId: string,
  documentId: string,
  token: string = randomUUID(),
): string {
  return `${documentPrefix(organizationId, documentId)}/${token}`;
}

export function createVerifiedStorageKey(
  organizationId: string,
  documentId: string,
  token: string = randomUUID(),
): string {
  return `${documentPrefix(organizationId, documentId)}/verified/${token}`;
}

export function isDocumentStagingKey(
  key: string,
  organizationId: string,
  documentId: string,
): boolean {
  const prefix = `${documentPrefix(organizationId, documentId)}/`;

  if (!key.startsWith(prefix)) {
    return false;
  }

  const token = key.slice(prefix.length);
  return token.length > 0 && !token.includes('/');
}

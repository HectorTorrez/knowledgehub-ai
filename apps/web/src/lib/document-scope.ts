import type { DocumentSummary } from '@knowledgehub/shared-types';

export const ALL_DOCUMENTS = 'all';

export interface DocumentScope {
  documentId: string | undefined;
  label: string;
}

export function readyDocuments(
  documents: DocumentSummary[],
): DocumentSummary[] {
  return documents.filter((document) => document.status === 'READY');
}

export function resolveDocumentScope(
  selection: string,
  documents: DocumentSummary[],
): DocumentScope {
  const document = readyDocuments(documents).find(
    (entry) => entry.id === selection,
  );

  return document
    ? { documentId: document.id, label: `“${document.title}”` }
    : { documentId: undefined, label: 'all documents' };
}

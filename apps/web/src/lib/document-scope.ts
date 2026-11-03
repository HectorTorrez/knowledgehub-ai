import type { DocumentSummary } from '@knowledgehub/shared-types';

export const ALL_DOCUMENTS = 'all';

export function collectionSelection(id: string): string {
  return `collection:${id}`;
}

export function selectedCollectionId(selection: string): string | undefined {
  return selection.startsWith('collection:')
    ? selection.slice(11) || undefined
    : undefined;
}

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

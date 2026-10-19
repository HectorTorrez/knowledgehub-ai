import type { DocumentSummary } from '@knowledgehub/shared-types';
import { describe, expect, it } from 'vitest';
import {
  ALL_DOCUMENTS,
  readyDocuments,
  resolveDocumentScope,
} from './document-scope';

function document(
  overrides: Partial<DocumentSummary> & { id: string },
): DocumentSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Report',
    status: overrides.status ?? 'READY',
    originalFileName: null,
    contentType: null,
    sizeBytes: null,
    failureReason: null,
    failureKind: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const READY = document({ id: 'doc-ready', title: 'Handbook' });
const PROCESSING = document({ id: 'doc-processing', status: 'PROCESSING' });

describe('readyDocuments', () => {
  it('keeps only the documents that can answer questions', () => {
    expect(readyDocuments([READY, PROCESSING])).toEqual([READY]);
  });
});

describe('resolveDocumentScope', () => {
  it('resolves the all-documents selection without a document id', () => {
    expect(resolveDocumentScope(ALL_DOCUMENTS, [READY])).toEqual({
      documentId: undefined,
      label: 'all documents',
    });
  });

  it('resolves a ready document selection to its id and quoted title', () => {
    expect(resolveDocumentScope('doc-ready', [READY, PROCESSING])).toEqual({
      documentId: 'doc-ready',
      label: '“Handbook”',
    });
  });

  it('falls back to all documents for a document that is not ready', () => {
    expect(resolveDocumentScope('doc-processing', [READY, PROCESSING])).toEqual({
      documentId: undefined,
      label: 'all documents',
    });
  });

  it('falls back to all documents for an unknown document id', () => {
    expect(resolveDocumentScope('doc-missing', [READY])).toEqual({
      documentId: undefined,
      label: 'all documents',
    });
  });
});

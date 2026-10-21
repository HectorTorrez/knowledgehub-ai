import { describe, expect, it } from 'vitest';
import {
  buildDocumentCatalog,
  CATALOG_CONTENT_MAX_CHARS,
  type CatalogDocumentRow,
} from './answer-catalog.js';

function row(
  overrides: Partial<CatalogDocumentRow> = {},
): CatalogDocumentRow {
  return {
    id: 'doc-1',
    title: 'Envios locales',
    originalFileName: 'envios.xlsx',
    generation: 1,
    extractions: [{ documentGeneration: 1, pageCount: 2 }],
    chunks: [
      {
        id: 'chunk-1',
        documentGeneration: 1,
        pageNumber: 1,
        chunkIndex: 0,
        content: 'Guía Fecha Cliente Monto',
      },
    ],
    ...overrides,
  };
}

describe('buildDocumentCatalog', () => {
  it('maps the current generation chunk into a citable catalog source', () => {
    const catalog = buildDocumentCatalog([row()], 1, 0);

    expect(catalog.total).toBe(1);
    expect(catalog.sources).toEqual([
      {
        marker: 1,
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentTitle: 'Envios locales',
        pageNumber: 1,
        chunkIndex: 0,
        content: 'Guía Fecha Cliente Monto',
        similarity: 1,
        pageCount: 2,
        originalFileName: 'envios.xlsx',
      },
    ]);
  });

  it('numbers catalog markers after the retrieved passages', () => {
    const catalog = buildDocumentCatalog([row()], 1, 8);

    expect(catalog.sources[0]?.marker).toBe(9);
  });

  it('skips a document whose first chunk belongs to a stale generation', () => {
    const catalog = buildDocumentCatalog(
      [
        row({
          generation: 2,
          chunks: [
            {
              id: 'chunk-old',
              documentGeneration: 1,
              pageNumber: 1,
              chunkIndex: 0,
              content: 'old',
            },
          ],
        }),
      ],
      1,
      0,
    );

    expect(catalog.sources).toEqual([]);
  });

  it('keeps the document when extraction metadata is missing', () => {
    const catalog = buildDocumentCatalog([row({ extractions: [] })], 1, 0);

    expect(catalog.sources[0]).toMatchObject({
      pageCount: null,
      originalFileName: 'envios.xlsx',
    });
  });

  it('truncates the catalog excerpt to the policy limit', () => {
    const catalog = buildDocumentCatalog(
      [row({ chunks: [{ ...row().chunks[0]!, content: 'a'.repeat(500) }] })],
      1,
      0,
    );

    expect(catalog.sources[0]?.content).toHaveLength(
      CATALOG_CONTENT_MAX_CHARS,
    );
    expect(catalog.sources[0]?.content.endsWith('…')).toBe(true);
  });

  it('reports the full document total even when fewer rows are returned', () => {
    const catalog = buildDocumentCatalog([row()], 12, 0);

    expect(catalog.sources).toHaveLength(1);
    expect(catalog.total).toBe(12);
  });
});

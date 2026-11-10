import type { AnswerSource } from './answer-context.js';

export const MAX_CATALOG_DOCUMENTS = 20;

export const CATALOG_CONTENT_MAX_CHARS = 240;
export const MAX_CATALOG_SUMMARY_CHARS = 12000;

export interface CatalogDocumentRow {
  id: string;
  title: string;
  originalFileName: string | null;
  generation: number;
  summaries: Array<{
    documentGeneration: number;
    summary: string;
    keyTopics: string[];
  }>;
  extractions: Array<{
    documentGeneration: number;
    pageCount: number;
  }>;
  chunks: Array<{
    id: string;
    documentGeneration: number;
    pageNumber: number;
    chunkIndex: number;
    content: string;
  }>;
}

export interface CatalogSource extends AnswerSource {
  pageCount: number | null;
  originalFileName: string | null;
}

export interface DocumentCatalog {
  sources: CatalogSource[];
  total: number;
}

function excerpt(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= CATALOG_CONTENT_MAX_CHARS) {
    return collapsed;
  }

  return `${collapsed.slice(0, CATALOG_CONTENT_MAX_CHARS - 1).trimEnd()}…`;
}

export function buildDocumentCatalog(
  rows: CatalogDocumentRow[],
  total: number,
  startMarker: number,
): DocumentCatalog {
  const sources: CatalogSource[] = [];
  let summaryCharsRemaining = MAX_CATALOG_SUMMARY_CHARS;

  for (const row of rows) {
    const extraction = row.extractions.find(
      (candidate) => candidate.documentGeneration === row.generation,
    );
    const chunk = row.chunks.find(
      (candidate) => candidate.documentGeneration === row.generation,
    );

    if (!chunk) {
      continue;
    }

    const summary = row.summaries.find(
      (candidate) => candidate.documentGeneration === row.generation,
    );
    const summaryContent = summary
      ? `Summary: ${summary.summary}\nKey topics: ${summary.keyTopics.join(', ')}`.slice(
          0,
          summaryCharsRemaining,
        )
      : null;
    summaryCharsRemaining -= summaryContent?.length ?? 0;

    sources.push({
      marker: startMarker + sources.length + 1,
      chunkId: chunk.id,
      documentId: row.id,
      documentGeneration: row.generation,
      documentTitle: row.title,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      content: summaryContent ?? excerpt(chunk.content),
      similarity: 1,
      pageCount: extraction?.pageCount ?? null,
      originalFileName: row.originalFileName,
    });
  }

  return { sources, total };
}

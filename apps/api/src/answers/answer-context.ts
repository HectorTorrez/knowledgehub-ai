import type { RetrievedChunk } from '../retrieval/retrieval.service.js';

export interface ContextBudget {
  maxSources: number;
  maxChars: number;
  minSimilarity: number;
}

export interface AnswerSource {
  marker: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  similarity: number;
}

const SOURCE_SEPARATOR = '\n\n';

export function escapeSourceText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSourceBlock(source: AnswerSource): string {
  const title = escapeSourceText(source.documentTitle);
  const content = escapeSourceText(source.content);

  return `<source id="${source.marker}" title="${title}" page="${source.pageNumber}">\n${content}\n</source>`;
}

export function renderSourcesSection(sources: AnswerSource[]): string {
  return sources.map(renderSourceBlock).join(SOURCE_SEPARATOR);
}

export function assembleContext(
  chunks: RetrievedChunk[],
  budget: ContextBudget,
): AnswerSource[] {
  const sources: AnswerSource[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    if (sources.length >= budget.maxSources) {
      break;
    }

    if (!chunk.lexicalMatch && chunk.similarity < budget.minSimilarity) {
      continue;
    }

    const candidate: AnswerSource = {
      marker: sources.length + 1,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentTitle: chunk.title,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      similarity: chunk.similarity,
    };

    const separatorChars = sources.length > 0 ? SOURCE_SEPARATOR.length : 0;
    const blockChars = renderSourceBlock(candidate).length;

    if (usedChars + separatorChars + blockChars > budget.maxChars) {
      continue;
    }

    usedChars += separatorChars + blockChars;
    sources.push(candidate);
  }

  return sources;
}

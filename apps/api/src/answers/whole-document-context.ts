import { renderSourcesSection, type AnswerSource, type ContextBudget } from './answer-context.js';
import { joinText } from './neighbor-expansion.js';

export interface DocumentContextChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

export function wholeDocumentContext(chunks: DocumentContextChunk[], budget: ContextBudget): AnswerSource[] | null {
  if (!chunks.length) return null;
  const ordered = [...chunks].sort((a, b) => a.pageNumber - b.pageNumber || a.chunkIndex - b.chunkIndex);
  const sources: AnswerSource[] = [];
  for (const chunk of ordered) {
    const previous = sources.at(-1);
    if (previous && previous.pageNumber === chunk.pageNumber) {
      previous.content = joinText(previous.content, chunk.content);
    } else {
      sources.push({ ...chunk, marker: sources.length + 1, similarity: 1 });
    }
  }
  return sources.length <= budget.maxSources && renderSourcesSection(sources).length <= budget.maxChars ? sources : null;
}

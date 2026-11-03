import { joinText } from '../answers/neighbor-expansion.js';
import type { StoredChunk } from '../facts/facts.store.js';

export function summaryInput(chunks: StoredChunk[], budget: number): string {
  const pages = new Map<number, string>();
  for (const chunk of [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)) {
    const previous = pages.get(chunk.pageNumber);
    pages.set(
      chunk.pageNumber,
      previous === undefined
        ? chunk.content
        : joinText(previous, chunk.content),
    );
  }
  const text = [...pages.values()].join('\n');
  if (text.length <= budget) return text;
  const beginning = Math.ceil(budget / 2);
  const remaining = budget - beginning;
  const later = text.slice(beginning);
  const pieces = Math.min(8, remaining);
  if (!pieces) return text.slice(0, budget);
  const samples: string[] = [];
  for (let i = 0; i < pieces; i++) {
    const size =
      Math.floor(remaining / pieces) + (i < remaining % pieces ? 1 : 0);
    const start = Math.floor(
      ((later.length - size) * i) / Math.max(1, pieces - 1),
    );
    samples.push(later.slice(start, start + size));
  }
  return text.slice(0, beginning) + samples.join('');
}

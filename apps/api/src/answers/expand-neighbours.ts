import { CHUNK_OVERLAP_CHARACTERS } from '../processing/chunking.policy.js';
import { renderSourcesSection, type AnswerSource } from './answer-context.js';

export interface Neighbour {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

const MIN_SHARED_CHARACTERS = 20;

function sharedLength(left: string, right: string): number {
  const longest = Math.min(left.length, right.length, CHUNK_OVERLAP_CHARACTERS);

  for (let length = longest; length >= MIN_SHARED_CHARACTERS; length--) {
    if (left.endsWith(right.slice(0, length))) {
      return length;
    }
  }

  return 0;
}

function joinChunks(left: string, right: string): string {
  const shared = sharedLength(left, right);

  return shared > 0 ? left + right.slice(shared) : `${left}\n${right}`;
}

export function expandNeighbours(
  sources: AnswerSource[],
  neighbours: Neighbour[],
  maxChars: number,
): AnswerSource[] {
  const result = sources.map((source) => ({ ...source }));
  const used = new Set(sources.map((source) => source.chunkId));
  for (const source of result) {
    for (const index of [source.chunkIndex - 1, source.chunkIndex + 1]) {
      const neighbour = neighbours.find(
        (item) =>
          item.documentId === source.documentId &&
          item.chunkIndex === index &&
          !used.has(item.chunkId),
      );
      if (!neighbour) continue;
      const original = source.content;
      source.content =
        index < source.chunkIndex
          ? joinChunks(neighbour.content, original)
          : joinChunks(original, neighbour.content);
      if (renderSourcesSection(result).length > maxChars) {
        source.content = original;
      } else {
        used.add(neighbour.chunkId);
      }
    }
  }
  return result;
}

import { renderSourcesSection, type AnswerSource } from "./answer-context.js";

export interface Neighbour {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

function joinChunks(left: string, right: string): string {
  const overlap = 320;
  if (
    left.length >= overlap &&
    right.length >= overlap &&
    left.slice(-overlap) === right.slice(0, overlap)
  ) {
    return left + right.slice(overlap);
  }
  return `${left}\n${right}`;
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

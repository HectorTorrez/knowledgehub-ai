import type { RetrievedChunk } from '../retrieval/retrieval.service.js';

export interface NeighborChunk {
  hitId: string;
  chunkId: string;
  documentId: string;
  documentGeneration: number;
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

export interface ExpandedHit {
  hit: RetrievedChunk;
  content: string;
  chunkIds: string[];
}

function joinText(left: string, right: string): string {
  for (let length = Math.min(left.length, right.length); length > 0; length--) {
    if (left.endsWith(right.slice(0, length))) return left + right.slice(length);
  }
  return `${left}\n${right}`;
}

export function expandNeighbors(hits: RetrievedChunk[], rows: NeighborChunk[]): ExpandedHit[] {
  const groups: Array<{ hits: RetrievedChunk[]; chunks: Map<string, NeighborChunk> }> = [];
  for (const hit of hits) {
    const chunks = rows.filter((row) => row.hitId === hit.chunkId && row.pageNumber === hit.pageNumber);
    const ids = new Set(chunks.map((chunk) => chunk.chunkId));
    const matching = groups.filter((group) => [...group.chunks.keys()].some((id) => ids.has(id)));
    const group = matching[0] ?? { hits: [], chunks: new Map<string, NeighborChunk>() };
    if (!matching.length) groups.push(group);
    for (const other of matching.slice(1)) {
      group.hits.push(...other.hits);
      for (const [id, chunk] of other.chunks) group.chunks.set(id, chunk);
      groups.splice(groups.indexOf(other), 1);
    }
    group.hits.push(hit);
    for (const chunk of chunks) group.chunks.set(chunk.chunkId, chunk);
  }
  return groups.map((group) => {
    const hit = hits.find((candidate) => group.hits.includes(candidate))!;
    const chunks = [...group.chunks.values()].sort((a, b) => a.chunkIndex - b.chunkIndex);
    return { hit, content: chunks.length ? chunks.map((chunk) => chunk.content).reduce(joinText) : hit.content, chunkIds: chunks.map((chunk) => chunk.chunkId) };
  }).sort((a, b) => hits.indexOf(a.hit) - hits.indexOf(b.hit));
}

import type { RerankScore } from './reranker.port.js';

export function orderReranked<T extends { id: string }>(
  candidates: T[],
  scores: RerankScore[],
): T[] {
  const known = new Set(candidates.map((candidate) => candidate.id));
  const byId = new Map<string, number>();
  for (const { id, score } of scores) {
    if (known.has(id) && !byId.has(id)) byId.set(id, score);
  }
  const hasPositive = [...byId.values()].some((score) => score > 0);
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: byId.get(candidate.id),
    }))
    .filter(({ score }) => !hasPositive || score !== 0)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index)
    .map(({ candidate }) => candidate);
}

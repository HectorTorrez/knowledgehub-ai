export interface PageRef {
  title: string;
  pageNumber: number;
}

function key(page: PageRef): string {
  return JSON.stringify([page.title, page.pageNumber]);
}

export function recallAtK(results: PageRef[], expected: PageRef[], k: number): number {
  const relevant = new Set(expected.map(key));
  if (relevant.size === 0) return 0;
  const hits = new Set(results.slice(0, Math.max(0, k)).map(key));
  return [...relevant].filter((page) => hits.has(page)).length / relevant.size;
}

export function reciprocalRank(results: PageRef[], expected: PageRef[]): number {
  const relevant = new Set(expected.map(key));
  const index = results.findIndex((page) => relevant.has(key(page)));
  return index < 0 ? 0 : 1 / (index + 1);
}

export function meanReciprocalRank(ranks: number[]): number {
  return ranks.length === 0 ? 0 : ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
}

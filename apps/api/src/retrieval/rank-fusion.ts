const RANK_CONSTANT = 60;

export function fuseRanks<T extends { chunkId: string }>(lists: T[][]): T[] {
  const scores = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((item, index) => {
      if (seen.has(item.chunkId)) return;
      seen.add(item.chunkId);
      const existing = scores.get(item.chunkId);
      scores.set(item.chunkId, {
        item: existing?.item ?? item,
        score: (existing?.score ?? 0) + 1 / (RANK_CONSTANT + index + 1),
      });
    });
  }
  return [...scores.values()]
    .sort(
      (a, b) =>
        b.score - a.score || a.item.chunkId.localeCompare(b.item.chunkId),
    )
    .map(({ item }) => item);
}

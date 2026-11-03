interface RankedChunk {
  chunkId: string;
}

export function fuseRanks<T extends RankedChunk>(vector: T[], lexical: T[]) {
  const entries = new Map<string, { chunk: T; score: number; matchedLexically: boolean }>();
  for (const [leg, rows] of [vector, lexical].entries()) {
    rows.forEach((chunk, index) => {
      const entry = entries.get(chunk.chunkId) ?? { chunk, score: 0, matchedLexically: false };
      entry.score += 1 / (60 + index + 1);
      entry.matchedLexically ||= leg === 1;
      entries.set(chunk.chunkId, entry);
    });
  }
  return [...entries.values()]
    .sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId))
    .map(({ chunk, score, matchedLexically }) => ({
      ...chunk,
      relevance: score / (2 / 61),
      matchedLexically,
    }));
}

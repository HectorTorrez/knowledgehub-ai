import { describe, expect, it, vi } from 'vitest';
import { CachedQueryEmbedding } from './cached-query-embedding.js';
import {
  MemoryQueryCache,
  queryCacheKey,
  type QueryCache,
} from './query-cache.js';

describe('query embedding cache', () => {
  it('hits normalized keys, expires entries and evicts least recently used entries', async () => {
    let now = 0;
    const cache = new MemoryQueryCache(2, 1, () => now);
    const provider = {
      embed: vi.fn(async (texts: string[]) =>
        texts.map((text) => [text.length]),
      ),
    };
    const cached = new CachedQueryEmbedding(provider, cache, 'model');
    await cached.embed([' hello   world ']);
    await cached.embed(['hello world']);
    expect(provider.embed).toHaveBeenCalledTimes(1);
    await cached.embed(['other']);
    await cached.embed(['hello world']);
    await cached.embed(['third']);
    await cached.embed(['other']);
    expect(provider.embed).toHaveBeenCalledTimes(4);
    now = 1000;
    await cached.embed(['other']);
    expect(provider.embed).toHaveBeenCalledTimes(5);
    expect(queryCacheKey('model', 'Hello')).not.toBe(
      queryCacheKey('model', 'hello'),
    );
  });
  it('bypasses disabled caches and cache errors', async () => {
    const provider = { embed: vi.fn(async () => [[1]]) };
    const broken: QueryCache = {
      get: async () => {
        throw new Error();
      },
      set: async () => {
        throw new Error();
      },
    };
    for (const cache of [
      new MemoryQueryCache(0, 1),
      new MemoryQueryCache(1, 0),
      broken,
    ]) {
      const cached = new CachedQueryEmbedding(provider, cache, 'model');
      await cached.embed(['a']);
      await cached.embed(['a']);
    }
    expect(provider.embed).toHaveBeenCalledTimes(6);
  });
});

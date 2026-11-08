import type { EmbeddingProvider } from './embedding-provider.port.js';
import { queryCacheKey, type QueryCache } from './query-cache.js';

export class CachedQueryEmbedding implements EmbeddingProvider {
  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly cache: QueryCache,
    private readonly model: string,
  ) {}
  async embed(texts: string[]): Promise<number[][]> {
    return Promise.all(
      texts.map(async (text) => {
        const key = `embedding:${queryCacheKey(this.model, text)}`;
        try {
          const cached = await this.cache.get(key);
          if (cached !== null) {
            const value: unknown = JSON.parse(cached);
            if (
              Array.isArray(value) &&
              value.every(
                (n: unknown) => typeof n === 'number' && Number.isFinite(n),
              )
            )
              return value as number[];
          }
        } catch {
          return (await this.provider.embed([text]))[0]!;
        }
        const [vector] = await this.provider.embed([text]);
        if (!vector) throw new Error('Embedding provider returned no vector');
        try {
          await this.cache.set(key, JSON.stringify(vector));
        } catch {
          return vector;
        }
        return vector;
      }),
    );
  }
}

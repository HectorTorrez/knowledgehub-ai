import { EMBEDDING_VECTOR_DIMENSIONS } from '../../src/embeddings/embedding-policy.js';
import type { EmbeddingProvider } from '../../src/embeddings/embedding-provider.port.js';

export function deterministicVector(seed: number): number[] {
  return Array.from(
    { length: EMBEDDING_VECTOR_DIMENSIONS },
    (_, index) => (seed + 1) / (index + 1),
  );
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  embedImpl: EmbeddingProvider['embed'] = async (texts) =>
    texts.map((_, index) => deterministicVector(index + 1));

  embed(texts: string[]): Promise<number[][]> {
    return this.embedImpl(texts);
  }
}

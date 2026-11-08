import { describe, expect, it, vi } from 'vitest';
import { MemoryQueryCache } from '../embeddings/query-cache.js';
import { CachedQueryRewriter } from './cached-query-rewriter.js';

describe('CachedQueryRewriter', () => {
  it('caches standalone questions but never conversation context', async () => {
    const provider = { rewrite: vi.fn(async () => 'rewritten') };
    const rewriter = new CachedQueryRewriter(
      provider,
      new MemoryQueryCache(10, 60),
      'model',
    );
    await rewriter.rewrite(' question ', []);
    await rewriter.rewrite('question', []);
    expect(provider.rewrite).toHaveBeenCalledTimes(1);
    const history = [{ question: 'earlier', answer: 'answer' }];
    await rewriter.rewrite('question', history);
    await rewriter.rewrite('question', history);
    expect(provider.rewrite).toHaveBeenCalledTimes(3);
  });
});

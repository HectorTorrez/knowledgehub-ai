import { queryCacheKey, type QueryCache } from '../embeddings/query-cache.js';
import type { ConversationTurn } from './answer-prompt.js';
import type { QueryRewriter } from './query-rewriter.port.js';

export class CachedQueryRewriter implements QueryRewriter {
  constructor(
    private readonly provider: QueryRewriter,
    private readonly cache: QueryCache,
    private readonly model: string,
  ) {}
  async rewrite(
    question: string,
    history: ConversationTurn[],
  ): Promise<string> {
    if (history.length) return this.provider.rewrite(question, history);
    const key = `rewrite:${queryCacheKey(this.model, question)}`;
    try {
      const cached = await this.cache.get(key);
      if (cached) return cached;
    } catch {
      return this.provider.rewrite(question, history);
    }
    const result = await this.provider.rewrite(question, history);
    try {
      await this.cache.set(key, result);
    } catch {
      return result;
    }
    return result;
  }
}

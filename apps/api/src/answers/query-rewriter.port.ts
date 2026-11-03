import type { ConversationTurn } from './answer-prompt.js';

export const QUERY_REWRITER = Symbol('QUERY_REWRITER');

export interface QueryRewriter {
  rewrite(question: string, history: ConversationTurn[]): Promise<string>;
}

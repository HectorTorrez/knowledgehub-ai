export const RERANKER = Symbol('RERANKER');

export interface RerankCandidate {
  id: string;
  title: string;
  page: number | null;
  text: string;
}

export interface RerankScore {
  id: string;
  score: number;
}

export interface Reranker {
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankScore[]>;
}

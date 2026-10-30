export const DEFAULT_RETRIEVAL_LIMIT = 10;

export const RETRIEVAL_CANDIDATE_LIMIT = 40;

export const MAX_RETRIEVAL_LIMIT = 50;

export class RetrievalQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetrievalQueryError';
  }
}

export function assertRetrievalQuery(text: string, limit: number): void {
  if (text.trim().length === 0) {
    throw new RetrievalQueryError('The retrieval query text must not be blank');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
    throw new RetrievalQueryError(
      `The retrieval limit must be an integer between 1 and ${MAX_RETRIEVAL_LIMIT}`,
    );
  }
}

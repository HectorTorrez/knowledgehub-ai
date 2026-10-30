export const DEFAULT_ANSWER_MODEL = 'gpt-4.1-mini';

export const DEFAULT_ANSWER_TIMEOUT_MS = 30_000;

export const DEFAULT_ANSWER_MAX_OUTPUT_TOKENS = 1200;

export const MAX_ANSWER_OUTPUT_TOKENS = 4_096;

export const DEFAULT_ANSWER_MAX_SOURCES = 12;

export const MAX_ANSWER_SOURCES = 20;

export const DEFAULT_ANSWER_CONTEXT_MAX_CHARS = 24_000;

export const MIN_ANSWER_CONTEXT_MAX_CHARS = 1_000;

export const MAX_ANSWER_CONTEXT_MAX_CHARS = 100_000;

export const DEFAULT_ANSWER_MIN_SIMILARITY = 0.2;

export const MAX_ANSWER_QUESTION_CHARS = 2_000;

export const DEFAULT_ANSWER_HISTORY_MAX_CHARS = 8_000;

export const MIN_ANSWER_HISTORY_MAX_CHARS = 1_000;

export const MAX_ANSWER_HISTORY_MAX_CHARS = 100_000;

export const CITATION_EXCERPT_MAX_CHARS = 300;

export class AnswerQuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnswerQuestionError';
  }
}

export function assertAnswerQuestion(question: string): void {
  const trimmed = question.trim();

  if (trimmed.length === 0) {
    throw new AnswerQuestionError('The answer question must not be blank');
  }

  if (trimmed.length > MAX_ANSWER_QUESTION_CHARS) {
    throw new AnswerQuestionError(
      `The answer question must not exceed ${MAX_ANSWER_QUESTION_CHARS} characters`,
    );
  }
}

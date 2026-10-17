import type { AnswerPrompt } from './answer-prompt.js';

export const ANSWER_PROVIDER = Symbol('ANSWER_PROVIDER');

export interface AnswerGenerationOptions {
  maxOutputTokens: number;
}

export interface AnswerProvider {
  generate(
    prompt: AnswerPrompt,
    options: AnswerGenerationOptions,
  ): Promise<unknown>;
}

export type AnswerRejectionSource = 'configuration' | 'request';

/**
 * The provider rejected the request as submitted. `source` records whether the
 * cause is the configured credential or the request body, because the two are
 * operationally different: a rejected credential is fixed in configuration,
 * while a rejected request is an adapter defect.
 */
export class AnswerRejectedError extends Error {
  constructor(
    message: string,
    readonly source: AnswerRejectionSource,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AnswerRejectedError';
  }
}

/**
 * The provider was unreachable, timed out, rate-limited, or failed with a 5xx.
 * The request may succeed if retried later.
 */
export class AnswerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AnswerUnavailableError';
  }
}

/**
 * The provider answered but the body was not usable: unparseable JSON or a
 * missing completion choice. The payload is discarded rather than returned.
 */
export class AnswerResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AnswerResponseError';
  }
}

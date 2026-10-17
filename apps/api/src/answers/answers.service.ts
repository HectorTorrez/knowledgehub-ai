import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AnswerResponse } from '@knowledgehub/shared-types';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import { RetrievalService } from '../retrieval/retrieval.service.js';
import { buildCitations, validateAnswerContract } from './answer-citation.js';
import {
  assembleContext,
  type AnswerSource,
  type ContextBudget,
} from './answer-context.js';
import {
  ANSWER_PROVIDER,
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
  type AnswerGeneration,
  type AnswerProvider,
} from './answer-provider.port.js';
import { buildAnswerPrompt, type AnswerPrompt } from './answer-prompt.js';
import { AnswerConfig } from './answer.config.js';

const SERVICE_UNAVAILABLE_MESSAGE =
  'The answer service is temporarily unavailable';

const INSUFFICIENT_EVIDENCE_RESPONSE: AnswerResponse = {
  status: 'insufficient_evidence',
  answer: null,
  citations: [],
};

type AnswerStatus = AnswerResponse['status'] | 'error';

interface AnswerLogEvent {
  status: AnswerStatus;
  organizationId: string;
  userId: string;
  model: string;
  sourceCount: number;
  promptChars: number;
  citationCount: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorName?: string;
}

function withCause<T extends Error>(exception: T, cause: unknown): T {
  exception.cause = cause;
  return exception;
}

function errorNameOf(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    return error.cause.name;
  }

  return error instanceof Error ? error.name : 'UnknownError';
}

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);

  constructor(
    @Inject(ANSWER_PROVIDER)
    private readonly provider: AnswerProvider,
    private readonly retrieval: RetrievalService,
    private readonly config: AnswerConfig,
  ) {}

  async answer(
    organizationId: string,
    userId: string,
    question: string,
  ): Promise<AnswerResponse> {
    const startedAt = Date.now();
    const event: AnswerLogEvent = {
      status: 'error',
      organizationId,
      userId,
      model: this.config.model,
      sourceCount: 0,
      promptChars: 0,
      citationCount: 0,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
    };

    try {
      const response = await this.run(organizationId, question, event);
      event.status = response.status;
      event.citationCount = response.citations.length;
      return response;
    } catch (error) {
      event.errorName = errorNameOf(error);
      throw error;
    } finally {
      event.durationMs = Date.now() - startedAt;
      this.log(event);
    }
  }

  private async run(
    organizationId: string,
    question: string,
    event: AnswerLogEvent,
  ): Promise<AnswerResponse> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Answer generation is not enabled');
    }

    const sources = await this.retrieveSources(organizationId, question);
    event.sourceCount = sources.length;

    if (sources.length === 0) {
      return { ...INSUFFICIENT_EVIDENCE_RESPONSE };
    }

    const prompt = buildAnswerPrompt(question, sources);
    event.promptChars = prompt.system.length + prompt.user.length;

    const generation = await this.generate(prompt);
    event.inputTokens = generation.usage.inputTokens;
    event.outputTokens = generation.usage.outputTokens;

    const contract = validateAnswerContract(generation.draft, sources);

    if (!contract.ok) {
      throw new BadGatewayException('The answer could not be grounded');
    }

    if (contract.status === 'insufficient_evidence') {
      return { ...INSUFFICIENT_EVIDENCE_RESPONSE };
    }

    return {
      status: 'answered',
      answer: contract.answer,
      citations: buildCitations(contract.markers, sources),
    };
  }

  private log(event: AnswerLogEvent): void {
    if (event.status === 'error') {
      this.logger.warn(event);
      return;
    }

    this.logger.log(event);
  }

  private async retrieveSources(
    organizationId: string,
    question: string,
  ): Promise<AnswerSource[]> {
    let chunks;

    try {
      chunks = await this.retrieval.search({
        organizationId,
        text: question,
        limit: this.config.maxSources,
      });
    } catch (error) {
      throw mapRetrievalError(error);
    }

    return assembleContext(chunks, this.contextBudget());
  }

  private contextBudget(): ContextBudget {
    return {
      maxSources: this.config.maxSources,
      maxChars: this.config.contextMaxChars,
      minSimilarity: this.config.minSimilarity,
    };
  }

  private async generate(prompt: AnswerPrompt): Promise<AnswerGeneration> {
    try {
      return await this.provider.generate(prompt, {
        maxOutputTokens: this.config.maxOutputTokens,
      });
    } catch (error) {
      throw mapAnswerError(error);
    }
  }
}

function mapRetrievalError(error: unknown): Error {
  if (error instanceof EmbeddingUnavailableError) {
    return withCause(
      new ServiceUnavailableException(SERVICE_UNAVAILABLE_MESSAGE),
      error,
    );
  }

  if (
    error instanceof EmbeddingRejectedError ||
    error instanceof EmbeddingResponseError
  ) {
    return withCause(
      new BadGatewayException(
        'The retrieval provider returned an unusable response',
      ),
      error,
    );
  }

  return error instanceof Error
    ? error
    : new Error('The retrieval step failed');
}

function mapAnswerError(error: unknown): Error {
  if (error instanceof AnswerUnavailableError) {
    return withCause(
      new ServiceUnavailableException(SERVICE_UNAVAILABLE_MESSAGE),
      error,
    );
  }

  if (
    error instanceof AnswerRejectedError ||
    error instanceof AnswerResponseError
  ) {
    return withCause(
      new BadGatewayException(
        'The answer provider returned an unusable response',
      ),
      error,
    );
  }

  return error instanceof Error ? error : new Error('The answer step failed');
}

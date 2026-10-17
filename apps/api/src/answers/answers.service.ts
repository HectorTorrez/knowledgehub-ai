import {
  BadGatewayException,
  Inject,
  Injectable,
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
  type AnswerProvider,
} from './answer-provider.port.js';
import { buildAnswerPrompt } from './answer-prompt.js';
import { AnswerConfig } from './answer.config.js';

const SERVICE_UNAVAILABLE_MESSAGE = 'The answer service is temporarily unavailable';

const INSUFFICIENT_EVIDENCE_RESPONSE: AnswerResponse = {
  status: 'insufficient_evidence',
  answer: null,
  citations: [],
};

@Injectable()
export class AnswersService {
  constructor(
    @Inject(ANSWER_PROVIDER)
    private readonly provider: AnswerProvider,
    private readonly retrieval: RetrievalService,
    private readonly config: AnswerConfig,
  ) {}

  async answer(
    organizationId: string,
    question: string,
  ): Promise<AnswerResponse> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        'Answer generation is not enabled',
      );
    }

    const sources = await this.retrieveSources(organizationId, question);

    if (sources.length === 0) {
      return { ...INSUFFICIENT_EVIDENCE_RESPONSE };
    }

    const draft = await this.generate(question, sources);
    const contract = validateAnswerContract(draft, sources);

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

  private async generate(
    question: string,
    sources: AnswerSource[],
  ): Promise<unknown> {
    const prompt = buildAnswerPrompt(question, sources);

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
    return new ServiceUnavailableException(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (
    error instanceof EmbeddingRejectedError ||
    error instanceof EmbeddingResponseError
  ) {
    return new BadGatewayException(
      'The retrieval provider returned an unusable response',
    );
  }

  return error instanceof Error
    ? error
    : new Error('The retrieval step failed');
}

function mapAnswerError(error: unknown): Error {
  if (error instanceof AnswerUnavailableError) {
    return new ServiceUnavailableException(SERVICE_UNAVAILABLE_MESSAGE);
  }

  if (
    error instanceof AnswerRejectedError ||
    error instanceof AnswerResponseError
  ) {
    return new BadGatewayException(
      'The answer provider returned an unusable response',
    );
  }

  return error instanceof Error ? error : new Error('The answer step failed');
}

import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AnswerCitation,
  AnswerDetail,
  AnswerDetailResponse,
  AnswerListResponse,
  AnswerResponse,
  AnswerSummary,
} from '@knowledgehub/shared-types';
import {
  decodeListCursor,
  encodeListCursor,
  listCursorFilter,
} from '../common/list-cursor.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsageService } from '../rate-limit/usage.service.js';
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
import { buildAnswerPrompt, type AnswerPrompt, type ConversationTurn } from './answer-prompt.js';
import { AnswerConfig } from './answer.config.js';
import type { ListAnswersInput } from './dto/list-answers.schema.js';

const SERVICE_UNAVAILABLE_MESSAGE =
  'The answer service is temporarily unavailable';

const INSUFFICIENT_EVIDENCE_RESPONSE: AnswerResponse = {
  status: 'insufficient_evidence',
  answer: null,
  citations: [],
};

const MAX_CONVERSATION_TURNS = 20;

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

const ANSWER_SELECT = {
  id: true,
  question: true,
  status: true,
  answer: true,
  citations: true,
  conversationId: true,
  createdAt: true,
} as const;

interface AnswerProjection {
  id: string;
  question: string;
  status: AnswerResponse['status'];
  answer: string | null;
  citations: unknown;
  conversationId: string | null;
  createdAt: Date;
}

function toAnswerSummary(row: AnswerProjection): AnswerSummary {
  return {
    id: row.id,
    question: row.question,
    status: row.status,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnswerDetail(row: AnswerProjection): AnswerDetail {
  return {
    id: row.id,
    question: row.question,
    status: row.status,
    answer: row.answer,
    citations: toCitations(row.citations),
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCitations(value: unknown): AnswerCitation[] {
  return Array.isArray(value) ? (value as unknown as AnswerCitation[]) : [];
}

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);

  constructor(
    @Inject(ANSWER_PROVIDER)
    private readonly provider: AnswerProvider,
    private readonly retrieval: RetrievalService,
    private readonly config: AnswerConfig,
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  async answer(
    organizationId: string,
    userId: string,
    question: string,
    conversationId?: string,
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
      let history: ConversationTurn[] = [];

      if (conversationId) {
        await this.assertConversationInOrganization(
          conversationId,
          organizationId,
        );
        history = await this.loadConversationHistory(
          organizationId,
          conversationId,
        );
      }

      const response = await this.run(organizationId, question, event, history);
      event.status = response.status;
      event.citationCount = response.citations.length;
      await this.persistAnswer(
        organizationId,
        userId,
        question,
        response,
        conversationId,
      );
      return response;
    } catch (error) {
      event.errorName = errorNameOf(error);
      throw error;
    } finally {
      event.durationMs = Date.now() - startedAt;
      this.log(event);
    }
  }

  async list(
    organizationId: string,
    input: ListAnswersInput,
  ): Promise<AnswerListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    const rows = await this.prisma.answer.findMany({
      where: {
        organizationId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(cursor ? listCursorFilter(cursor) : {}),
      },
      select: ANSWER_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0 ? encodeListCursor(page[page.length - 1]) : null;

    return {
      answers: page.map(toAnswerSummary),
      nextCursor,
    };
  }

  async getDetail(
    organizationId: string,
    answerId: string,
  ): Promise<AnswerDetailResponse> {
    const row = await this.prisma.answer.findFirst({
      where: { id: answerId, organizationId },
      select: ANSWER_SELECT,
    });

    if (!row) {
      throw new NotFoundException('Answer not found');
    }

    return { answer: toAnswerDetail(row) };
  }

  async delete(organizationId: string, answerId: string): Promise<void> {
    const result = await this.prisma.answer.deleteMany({
      where: { id: answerId, organizationId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Answer not found');
    }
  }

  private async persistAnswer(
    organizationId: string,
    userId: string,
    question: string,
    response: AnswerResponse,
    conversationId?: string,
  ): Promise<void> {
    try {
      await this.prisma.answer.create({
        data: {
          organizationId,
          askedById: userId,
          question,
          status: response.status,
          answer: response.status === 'answered' ? response.answer : null,
          citations: response.citations as unknown as Prisma.InputJsonValue,
          ...(conversationId ? { conversationId } : {}),
        },
      });
    } catch (error) {
      this.logger.warn('Could not persist the answer to history', error);
    }
  }

  private async run(
    organizationId: string,
    question: string,
    event: AnswerLogEvent,
    history: ConversationTurn[],
  ): Promise<AnswerResponse> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Answer generation is not enabled');
    }

    const sources = await this.retrieveSources(organizationId, question);
    event.sourceCount = sources.length;

    if (sources.length === 0) {
      return { ...INSUFFICIENT_EVIDENCE_RESPONSE };
    }

    await this.usage.recordAnswer(organizationId);

    const prompt = buildAnswerPrompt(question, sources, history);
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

  private async assertConversationInOrganization(
    conversationId: string,
    organizationId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
  }

  private async loadConversationHistory(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationTurn[]> {
    const rows = await this.prisma.answer.findMany({
      where: {
        conversationId,
        organizationId,
        status: 'answered',
        answer: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { question: true, answer: true },
      take: MAX_CONVERSATION_TURNS,
    });

    const turns = rows
      .map((row) => ({ question: row.question, answer: row.answer as string }))
      .reverse();

    let remaining = this.config.historyMaxChars;
    const selected: ConversationTurn[] = [];

    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index] as ConversationTurn;
      const cost = turn.question.length + turn.answer.length;
      if (selected.length > 0 && cost > remaining) {
        break;
      }
      selected.unshift(turn);
      remaining -= cost;
    }

    return selected;
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

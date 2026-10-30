import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
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
  AnswerFeedbackResponse,
  AnswerListResponse,
  AnswerResponse,
  AnswerStreamEvent,
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
import { AggregationService } from '../aggregation/aggregation.service.js';
import { FactsConfig } from '../facts/facts.config.js';
import { buildAggregateAnswer, isAggregateQuestion } from './aggregate-answer.js';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  EmbeddingUnavailableError,
} from '../embeddings/embedding-provider.port.js';
import { RetrievalService } from '../retrieval/retrieval.service.js';
import { MAX_RETRIEVAL_LIMIT } from '../retrieval/retrieval-policy.js';
import { diversify } from '../retrieval/diversify.js';
import { expandNeighbours } from './expand-neighbours.js';
import {
  buildDocumentCatalog,
  MAX_CATALOG_DOCUMENTS,
  type CatalogDocumentRow,
} from './answer-catalog.js';
import { AnswerStreamParser } from './answer-claim-stream.js';
import {
  buildCitations,
  renderClaim,
  validateAnswerContract,
} from './answer-citation.js';
import { toAnswerStreamEvents } from './answer-stream.js';
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
import type { SetAnswerFeedbackInput } from './dto/set-answer-feedback.schema.js';

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
  catalogCount: number;
  promptChars: number;
  citationCount: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorName?: string;
}

type AnswerPlan =
  | { kind: 'direct'; response: AnswerResponse }
  | { kind: 'generate'; prompt: AnswerPrompt; sources: AnswerSource[] };

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
  feedback?: Array<{ value: 'UP' | 'DOWN'; comment: string | null }>;
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
    feedback: row.feedback?.[0] ?? null,
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
    private readonly aggregation: AggregationService,
    private readonly factsConfig: FactsConfig,
  ) {}

  async answer(
    organizationId: string,
    userId: string,
    question: string,
    conversationId?: string,
    documentId?: string,
  ): Promise<AnswerResponse> {
    const startedAt = Date.now();
    const event = this.createLogEvent(organizationId, userId);

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

      const response = await this.run(
        organizationId,
        question,
        event,
        history,
        documentId,
      );
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

  async *answerStream(
    organizationId: string,
    userId: string,
    question: string,
    conversationId?: string,
    documentId?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AnswerStreamEvent, void, void> {
    const startedAt = Date.now();
    const event = this.createLogEvent(organizationId, userId);

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

      const plan = await this.planAnswer(
        organizationId,
        question,
        event,
        history,
        documentId,
      );

      let response: AnswerResponse;

      if (plan.kind === 'direct') {
        response = plan.response;
        yield* toAnswerStreamEvents(response);
      } else if (this.provider.stream) {
        response = yield* this.streamGeneration(plan, event, signal);
      } else {
        response = await this.generateAnswer(plan, event);
        yield* toAnswerStreamEvents(response);
      }

      event.status = response.status;
      event.citationCount = response.citations.length;
      await this.persistAnswer(
        organizationId,
        userId,
        question,
        response,
        conversationId,
      );
    } catch (error) {
      event.errorName = errorNameOf(error);
      throw error;
    } finally {
      event.durationMs = Date.now() - startedAt;
      this.log(event);
    }
  }

  private createLogEvent(
    organizationId: string,
    userId: string,
  ): AnswerLogEvent {
    return {
      status: 'error',
      organizationId,
      userId,
      model: this.config.model,
      sourceCount: 0,
      catalogCount: 0,
      promptChars: 0,
      citationCount: 0,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
    };
  }

  private async generateAnswer(
    plan: { prompt: AnswerPrompt; sources: AnswerSource[] },
    event: AnswerLogEvent,
  ): Promise<AnswerResponse> {
    const generation = await this.generate(plan.prompt);
    event.inputTokens = generation.usage.inputTokens;
    event.outputTokens = generation.usage.outputTokens;

    return this.answerFromDraft(generation.draft, plan.sources);
  }

  private async *streamGeneration(
    plan: { prompt: AnswerPrompt; sources: AnswerSource[] },
    event: AnswerLogEvent,
    signal?: AbortSignal,
  ): AsyncGenerator<AnswerStreamEvent, AnswerResponse, void> {
    const stream = this.provider.stream;

    if (!stream) {
      throw new ServiceUnavailableException(SERVICE_UNAVAILABLE_MESSAGE);
    }

    const parser = new AnswerStreamParser();
    const seen = new Set<string>();
    const markers = new Set<number>();
    const parts: string[] = [];
    let status: AnswerResponse['status'] | null = null;
    let lastCitations = '';

    try {
      for await (const chunk of stream.call(
        this.provider,
        plan.prompt,
        { maxOutputTokens: this.config.maxOutputTokens },
        signal,
      )) {
        if (chunk.type === 'done') {
          event.inputTokens = chunk.usage.inputTokens;
          event.outputTokens = chunk.usage.outputTokens;
          continue;
        }

        const claims = parser.push(chunk.text);

        if (status === null && parser.answerStatus !== null) {
          status = parser.answerStatus;
          yield { type: 'status', status };
        }

        for (const claim of claims) {
          const text = claim.text.trim();

          if (text.length === 0 || seen.has(text)) {
            continue;
          }

          if (
            !Number.isInteger(claim.source) ||
            claim.source < 1 ||
            claim.source > plan.sources.length
          ) {
            throw new BadGatewayException('The answer could not be grounded');
          }

          seen.add(text);
          const rendered = renderClaim({ text, source: claim.source });
          parts.push(rendered);
          yield {
            type: 'delta',
            text: parts.length === 1 ? rendered : ` ${rendered}`,
          };

          if (!markers.has(claim.source)) {
            markers.add(claim.source);
            const citations = buildCitations([...markers], plan.sources);
            const serialized = JSON.stringify(citations);

            if (serialized !== lastCitations) {
              lastCitations = serialized;
              yield { type: 'citations', citations };
            }
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      throw mapAnswerError(error);
    }

    const response = this.parseStreamedResponse(parser.draft, plan.sources);

    if (status === null) {
      yield { type: 'status', status: response.status };
    }

    if (
      response.status === 'answered' &&
      parts.join(' ') !== response.answer
    ) {
      throw new BadGatewayException('The answer could not be grounded');
    }

    if (JSON.stringify(response.citations) !== lastCitations) {
      yield { type: 'citations', citations: response.citations };
    }

    return response;
  }

  private parseStreamedResponse(
    draft: string,
    sources: AnswerSource[],
  ): AnswerResponse {
    let parsed: unknown;

    try {
      parsed = JSON.parse(draft);
    } catch (error) {
      throw mapAnswerError(
        new AnswerResponseError(
          'The answer provider streamed an incomplete answer',
          { cause: error },
        ),
      );
    }

    return this.answerFromDraft(parsed, sources);
  }

  private answerFromDraft(
    draft: unknown,
    sources: AnswerSource[],
  ): AnswerResponse {
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

  async list(
    organizationId: string,
    userId: string,
    input: ListAnswersInput,
  ): Promise<AnswerListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    const rows = await this.prisma.answer.findMany({
      where: {
        organizationId,
        ...(input.askedBy === 'me' ? { askedById: userId } : {}),
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
    userId: string,
  ): Promise<AnswerDetailResponse> {
    const row = await this.prisma.answer.findFirst({
      where: { id: answerId, organizationId },
      select: {
        ...ANSWER_SELECT,
        feedback: {
          where: { userId },
          select: { value: true, comment: true },
          take: 1,
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Answer not found');
    }

    return { answer: toAnswerDetail(row) };
  }

  async setFeedback(
    organizationId: string,
    answerId: string,
    userId: string,
    input: SetAnswerFeedbackInput,
  ): Promise<AnswerFeedbackResponse> {
    await this.assertAnswerInOrganization(organizationId, answerId);

    const feedback = await this.prisma.answerFeedback.upsert({
      where: { answerId_userId: { answerId, userId } },
      create: {
        answerId,
        userId,
        value: input.value,
        comment: input.comment ?? null,
      },
      update: {
        value: input.value,
        comment: input.comment ?? null,
      },
      select: { value: true, comment: true },
    });

    return { feedback };
  }

  async clearFeedback(
    organizationId: string,
    answerId: string,
    userId: string,
  ): Promise<void> {
    await this.assertAnswerInOrganization(organizationId, answerId);

    await this.prisma.answerFeedback.deleteMany({
      where: { answerId, userId },
    });
  }

  private async assertAnswerInOrganization(
    organizationId: string,
    answerId: string,
  ): Promise<void> {
    const answer = await this.prisma.answer.findFirst({
      where: { id: answerId, organizationId },
      select: { id: true },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found');
    }
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

      if (conversationId) {
        await this.prisma.conversation.updateMany({
          where: { id: conversationId, organizationId, title: null },
          data: { title: titleFromQuestion(question) },
        });
      }
    } catch (error) {
      this.logger.warn('Could not persist the answer to history', error);
    }
  }

  private async run(
    organizationId: string,
    question: string,
    event: AnswerLogEvent,
    history: ConversationTurn[],
    documentId?: string,
  ): Promise<AnswerResponse> {
    const plan = await this.planAnswer(
      organizationId,
      question,
      event,
      history,
      documentId,
    );

    return plan.kind === 'direct'
      ? plan.response
      : this.generateAnswer(plan, event);
  }

  private async planAnswer(
    organizationId: string,
    question: string,
    event: AnswerLogEvent,
    history: ConversationTurn[],
    documentId?: string,
  ): Promise<AnswerPlan> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Answer generation is not enabled');
    }

    if (documentId) {
      await this.assertDocumentAnswerable(organizationId, documentId);
    }

    const aggregate = await this.aggregateAnswer(
      organizationId,
      question,
      documentId,
    );

    if (aggregate) {
      event.sourceCount = aggregate.citations.length;
      event.promptChars = aggregate.answer?.length ?? 0;
      return { kind: 'direct', response: aggregate };
    }

    const [sources, catalogRows] = await Promise.all([
      this.retrieveSources(organizationId, question, documentId),
      this.loadDocumentCatalogRows(organizationId, documentId),
    ]);

    const catalog = buildDocumentCatalog(
      catalogRows.rows,
      catalogRows.total,
      sources.length,
    );

    event.sourceCount = sources.length;
    event.catalogCount = catalog.sources.length;

    if (sources.length === 0 && catalog.sources.length === 0) {
      return {
        kind: 'direct',
        response: { ...INSUFFICIENT_EVIDENCE_RESPONSE },
      };
    }

    await this.usage.recordAnswer(organizationId);

    const prompt = buildAnswerPrompt(question, sources, history, catalog);
    event.promptChars = prompt.system.length + prompt.user.length;

    return {
      kind: 'generate',
      prompt,
      sources: [...sources, ...catalog.sources],
    };
  }

  private async aggregateAnswer(
    organizationId: string,
    question: string,
    documentId?: string,
  ): Promise<AnswerResponse | null> {
    if (!this.factsConfig.enabled || !isAggregateQuestion(question)) {
      return null;
    }

    const aggregate = await this.aggregation.contractTotals(organizationId, {
      ...(documentId ? { documentId } : {}),
      limit: 1,
      offset: 0,
    });

    if (aggregate.totalFacts === 0 || aggregate.sources.length === 0) {
      return null;
    }

    return buildAggregateAnswer(aggregate, question);
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
    documentId?: string,
  ): Promise<AnswerSource[]> {
    let chunks;

    try {
      chunks = await this.retrieval.search({
        organizationId,
        text: question,
        limit: Math.min(this.config.maxSources * 3, MAX_RETRIEVAL_LIMIT),
        ...(documentId ? { documentId } : {}),
      });
    } catch (error) {
      throw mapRetrievalError(error);
    }

    const sources = assembleContext(
      documentId ? chunks : diversify(chunks),
      this.contextBudget(),
    );
    const neighbours = await this.retrieval.neighbours(organizationId, sources);
    return expandNeighbours(sources, neighbours, this.config.contextMaxChars);
  }

  private async loadDocumentCatalogRows(
    organizationId: string,
    documentId?: string,
  ): Promise<{ rows: CatalogDocumentRow[]; total: number }> {
    const where = {
      organizationId,
      status: 'READY' as const,
      ...(documentId ? { id: documentId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          title: true,
          originalFileName: true,
          generation: true,
          extractions: {
            orderBy: { documentGeneration: 'desc' },
            take: 1,
            select: { documentGeneration: true, pageCount: true },
          },
          chunks: {
            orderBy: { chunkIndex: 'asc' },
            take: 1,
            select: {
              id: true,
              documentGeneration: true,
              pageNumber: true,
              chunkIndex: true,
              content: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_CATALOG_DOCUMENTS,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { rows, total };
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

  private async assertDocumentAnswerable(
    organizationId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { status: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status !== 'READY') {
      throw new ConflictException('Document is not ready to answer questions');
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

function titleFromQuestion(question: string): string {
  const normalized = question.replace(/\s+/g, ' ').trim();
  const maxLength = 80;

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

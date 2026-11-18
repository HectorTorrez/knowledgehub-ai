import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { QUERY_CACHE } from '../embeddings/embeddings.module.js';
import type { QueryCache } from '../embeddings/query-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnswerConfig } from './answer.config.js';
import { readableAnswerWhere } from './conversation-policy.js';
import {
  QUESTION_SUGGESTER,
  type QuestionSuggester,
  type SuggestionLocale,
} from './question-suggester.port.js';
import { MAX_STARTERS, sanitizeSuggestions } from './suggested-questions.js';

const MAX_FOLLOW_UP_SOURCES = 6;
const MAX_SOURCE_EXCERPT_CHARS = 600;
const MAX_STARTER_DOCUMENTS = 12;

interface StoredCitation {
  documentTitle?: unknown;
  excerpt?: unknown;
}

@Injectable()
export class QuestionSuggestionsService {
  private readonly logger = new Logger(QuestionSuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AnswerConfig,
    @Inject(QUESTION_SUGGESTER) private readonly suggester: QuestionSuggester,
    @Inject(QUERY_CACHE) private readonly cache: QueryCache,
  ) {}

  async followUps(
    organizationId: string,
    answerId: string,
    userId: string,
  ): Promise<string[]> {
    const answer = await this.prisma.answer.findFirst({
      where: {
        id: answerId,
        organizationId,
        AND: [readableAnswerWhere(userId)],
      },
      select: { question: true, answer: true, status: true, citations: true },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found');
    }

    if (
      !this.config.enabled ||
      answer.status === 'insufficient_evidence' ||
      !answer.answer
    ) {
      return [];
    }

    const sources = (Array.isArray(answer.citations) ? answer.citations : [])
      .slice(0, MAX_FOLLOW_UP_SOURCES)
      .flatMap((citation) => {
        const { documentTitle, excerpt } = (citation ?? {}) as StoredCitation;
        return typeof documentTitle === 'string' && typeof excerpt === 'string'
          ? [
              {
                title: documentTitle,
                excerpt: excerpt.slice(0, MAX_SOURCE_EXCERPT_CHARS),
              },
            ]
          : [];
      });
    const questionText = answer.question;
    const answerText = answer.answer;

    return this.cached(`suggestions:follow-ups:v1:${answerId}`, () =>
      this.suggester.followUps({
        question: questionText,
        answer: answerText,
        sources,
      }),
    );
  }

  async starters(
    organizationId: string,
    locale: SuggestionLocale,
  ): Promise<string[]> {
    if (!this.config.enabled) {
      return [];
    }

    const documents = await this.prisma.document.findMany({
      where: { organizationId, status: 'READY' },
      orderBy: { updatedAt: 'desc' },
      take: MAX_STARTER_DOCUMENTS,
      select: {
        id: true,
        title: true,
        generation: true,
        summaries: {
          where: { organizationId, document: { summaryStatus: 'READY' } },
          select: { documentGeneration: true, summary: true, keyTopics: true },
        },
      },
    });

    if (documents.length === 0) {
      return [];
    }

    const catalog = documents.map((document) => {
      const summary = document.summaries.find(
        (item) => item.documentGeneration === document.generation,
      );
      return {
        key: `${document.id}:${document.generation}:${summary ? 1 : 0}`,
        title: document.title,
        summary: summary?.summary ?? null,
        keyTopics: summary?.keyTopics ?? [],
      };
    });
    const fingerprint = createHash('sha256')
      .update(catalog.map((document) => document.key).join('|'))
      .digest('hex');

    return this.cached(
      `suggestions:starters:v1:${organizationId}:${locale}:${fingerprint}`,
      () =>
        this.suggester.starters({
          locale,
          documents: catalog.map(({ title, summary, keyTopics }) => ({
            title,
            summary,
            keyTopics,
          })),
        }),
    );
  }

  private async cached(
    key: string,
    generate: () => Promise<string[]>,
  ): Promise<string[]> {
    const hit = await this.cache.get(key).catch(() => null);

    if (hit !== null) {
      return sanitizeSuggestions(safeParse(hit), MAX_STARTERS);
    }

    let questions: string[];

    try {
      questions = await generate();
    } catch (error) {
      this.logger.warn(
        `Question suggestions unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }

    await this.cache.set(key, JSON.stringify(questions)).catch(() => undefined);
    return questions;
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

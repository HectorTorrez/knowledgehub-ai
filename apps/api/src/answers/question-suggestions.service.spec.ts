import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MemoryQueryCache } from '../embeddings/query-cache.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AnswerConfig } from './answer.config.js';
import type { QuestionSuggester } from './question-suggester.port.js';
import { QuestionSuggestionsService } from './question-suggestions.service.js';

const ORG = 'org-1';
const USER = 'user-1';

function setup({
  enabled = true,
  answer = {
    question: 'What is the notice period?',
    answer: 'Thirty days [1].',
    status: 'answered',
    citations: [{ documentTitle: 'Contract', excerpt: 'Notice: 30 days' }],
  } as object | null,
  documents = [] as object[],
} = {}) {
  const prisma = {
    answer: { findFirst: vi.fn().mockResolvedValue(answer) },
    document: { findMany: vi.fn().mockResolvedValue(documents) },
  };
  const suggester: QuestionSuggester = {
    followUps: vi.fn().mockResolvedValue(['Can notice be waived?']),
    starters: vi.fn().mockResolvedValue(['What does the contract cover?']),
  };
  const service = new QuestionSuggestionsService(
    prisma as unknown as PrismaService,
    { enabled } as AnswerConfig,
    suggester,
    new MemoryQueryCache(100, 60),
  );
  return { service, prisma, suggester };
}

describe('QuestionSuggestionsService', () => {
  it('scopes the answer lookup to readable answers in the organization', async () => {
    const { service, prisma } = setup();

    await service.followUps(ORG, 'answer-1', USER);

    expect(prisma.answer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'answer-1', organizationId: ORG }),
      }),
    );
  });

  it('returns 404 for an answer the member cannot read', async () => {
    const { service } = setup({ answer: null });

    await expect(
      service.followUps(ORG, 'answer-1', USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates follow-ups once and serves later requests from cache', async () => {
    const { service, suggester } = setup();

    await expect(service.followUps(ORG, 'answer-1', USER)).resolves.toEqual([
      'Can notice be waived?',
    ]);
    await service.followUps(ORG, 'answer-1', USER);

    expect(suggester.followUps).toHaveBeenCalledTimes(1);
    expect(suggester.followUps).toHaveBeenCalledWith({
      question: 'What is the notice period?',
      answer: 'Thirty days [1].',
      sources: [{ title: 'Contract', excerpt: 'Notice: 30 days' }],
    });
  });

  it('skips generation for unanswered questions or when answers are disabled', async () => {
    const unanswered = setup({
      answer: {
        question: 'Q?',
        answer: null,
        status: 'insufficient_evidence',
        citations: [],
      },
    });
    await expect(
      unanswered.service.followUps(ORG, 'answer-1', USER),
    ).resolves.toEqual([]);

    const disabled = setup({ enabled: false });
    await expect(disabled.service.starters(ORG, 'en')).resolves.toEqual([]);
    expect(disabled.suggester.starters).not.toHaveBeenCalled();
  });

  it('degrades to no suggestions when the provider fails', async () => {
    const { service, suggester } = setup();
    vi.mocked(suggester.followUps).mockRejectedValueOnce(new Error('down'));

    await expect(service.followUps(ORG, 'answer-1', USER)).resolves.toEqual([]);
  });

  it('builds starters from current-generation summaries of ready documents', async () => {
    const { service, prisma, suggester } = setup({
      documents: [
        {
          id: 'doc-1',
          title: 'Contract',
          generation: 2,
          summaries: [
            { documentGeneration: 1, summary: 'Old', keyTopics: ['old'] },
            {
              documentGeneration: 2,
              summary: 'Current',
              keyTopics: ['notice'],
            },
          ],
        },
        { id: 'doc-2', title: 'Handbook', generation: 1, summaries: [] },
      ],
    });

    await expect(service.starters(ORG, 'es')).resolves.toEqual([
      'What does the contract cover?',
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, status: 'READY' },
      }),
    );
    expect(suggester.starters).toHaveBeenCalledWith({
      locale: 'es',
      documents: [
        { title: 'Contract', summary: 'Current', keyTopics: ['notice'] },
        { title: 'Handbook', summary: null, keyTopics: [] },
      ],
    });

    await service.starters(ORG, 'es');
    expect(suggester.starters).toHaveBeenCalledTimes(1);
  });

  it('returns no starters when the organization has no ready documents', async () => {
    const { service, suggester } = setup();

    await expect(service.starters(ORG, 'en')).resolves.toEqual([]);
    expect(suggester.starters).not.toHaveBeenCalled();
  });
});

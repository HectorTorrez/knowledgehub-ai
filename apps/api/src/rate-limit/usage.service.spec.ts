import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RateLimitConfig } from './rate-limit.config.js';
import { UsageService } from './usage.service.js';

function buildUsage(options: {
  upsertImpl?: (args?: unknown) => Promise<unknown>;
  quota?: number;
} = {}) {
  const upsert = vi.fn(
    options.upsertImpl ?? (async () => ({ count: 1 })),
  );
  const findUnique = vi.fn(
    async (_args?: unknown): Promise<unknown> => null,
  );
  const prisma = {
    tenantUsage: { upsert, findUnique },
  } as unknown as PrismaService;
  const config = {
    answerQuotaDaily: options.quota ?? 1000,
  } as unknown as RateLimitConfig;

  return {
    service: new UsageService(prisma, config),
    upsert,
    findUnique,
  };
}

describe('UsageService', () => {
  it('records an answer against the current UTC day and kind', async () => {
    const { service, upsert } = buildUsage();

    await service.recordAnswer('org-1');

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]?.[0] as {
      where: {
        organizationId_kind_periodStart: {
          organizationId: string;
          kind: string;
          periodStart: Date;
        };
      };
    };
    expect(args.where.organizationId_kind_periodStart.organizationId).toBe(
      'org-1',
    );
    expect(args.where.organizationId_kind_periodStart.kind).toBe('answer');
    expect(
      args.where.organizationId_kind_periodStart.periodStart,
    ).toBeInstanceOf(Date);
  });

  it('allows usage at or below the daily quota', async () => {
    const { service } = buildUsage({
      upsertImpl: async () => ({ count: 1000 }),
      quota: 1000,
    });

    await expect(service.recordAnswer('org-1')).resolves.toBeUndefined();
  });

  it('throws 429 once the count exceeds the daily quota', async () => {
    const { service } = buildUsage({
      upsertImpl: async () => ({ count: 1001 }),
      quota: 1000,
    });

    await expect(service.recordAnswer('org-1')).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});

describe('UsageService.getAnswerUsage', () => {
  it('returns zero used when there is no counter for today', async () => {
    const { service } = buildUsage({ quota: 50 });

    const result = await service.getAnswerUsage('org-1');

    expect(result.usage.answers).toMatchObject({ used: 0, limit: 50 });
    expect(
      new Date(result.usage.answers.resetsAt).getTime() -
        new Date(result.usage.answers.periodStart).getTime(),
    ).toBe(86_400_000);
  });

  it('clamps the used count to the limit', async () => {
    const { service, findUnique } = buildUsage({ quota: 10 });
    findUnique.mockResolvedValueOnce({ count: 12 });

    const result = await service.getAnswerUsage('org-1');

    expect(result.usage.answers.used).toBe(10);
  });
});

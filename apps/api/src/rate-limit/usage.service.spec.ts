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
  const prisma = {
    tenantUsage: { upsert },
  } as unknown as PrismaService;
  const config = {
    answerQuotaDaily: options.quota ?? 1000,
  } as unknown as RateLimitConfig;

  return {
    service: new UsageService(prisma, config),
    upsert,
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

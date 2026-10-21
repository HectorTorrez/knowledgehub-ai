import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { OrganizationUsageResponse } from '@knowledgehub/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimitConfig } from './rate-limit.config.js';

const ANSWER_USAGE_KIND = 'answer';

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: RateLimitConfig,
  ) {}

  async getAnswerUsage(
    organizationId: string,
  ): Promise<OrganizationUsageResponse> {
    const periodStart = startOfUtcDay(new Date());
    const row = await this.prisma.tenantUsage.findUnique({
      where: {
        organizationId_kind_periodStart: {
          organizationId,
          kind: ANSWER_USAGE_KIND,
          periodStart,
        },
      },
      select: { count: true },
    });
    const limit = this.config.answerQuotaDaily;

    return {
      usage: {
        answers: {
          used: Math.min(row?.count ?? 0, limit),
          limit,
          periodStart: periodStart.toISOString(),
          resetsAt: new Date(
            periodStart.getTime() + MS_PER_DAY,
          ).toISOString(),
        },
      },
    };
  }

  async recordAnswer(organizationId: string): Promise<void> {
    const periodStart = startOfUtcDay(new Date());

    const result = await this.prisma.tenantUsage.upsert({
      where: {
        organizationId_kind_periodStart: {
          organizationId,
          kind: ANSWER_USAGE_KIND,
          periodStart,
        },
      },
      create: {
        organizationId,
        kind: ANSWER_USAGE_KIND,
        periodStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    if (result.count > this.config.answerQuotaDaily) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'The organization has reached its daily answer limit',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

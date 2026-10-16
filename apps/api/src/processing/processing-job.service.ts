import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  LEASE_EXPIRED_ATTEMPTS_EXHAUSTED,
  PROCESSING_LEASE_DURATION_SECONDS,
} from './processing-lease.policy.js';

export interface ClaimedProcessingJob {
  id: string;
  documentId: string;
  organizationId: string;
  documentGeneration: number;
  verifiedStorageKey: string;
  attempt: number;
  maxAttempts: number;
  leaseId: string;
  leaseExpiresAt: Date;
}

export interface ExpiredLeaseRecovery {
  recovered: number;
  failed: number;
}

export interface JobLease {
  jobId: string;
  leaseId: string;
}

export interface ProcessingOwnership {
  jobId: string;
  leaseId: string;
  organizationId: string;
  documentGeneration: number;
  verifiedStorageKey: string;
}

interface ExistsRow {
  ok: number;
}

@Injectable()
export class ProcessingJobService {
  constructor(private readonly prisma: PrismaService) {}

  async claimNextDueJob(workerId: string): Promise<ClaimedProcessingJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedProcessingJob[]>`
      UPDATE "DocumentProcessingJob"
      SET state = 'CLAIMED',
          "leaseId" = gen_random_uuid(),
          "leaseExpiresAt" = now() + make_interval(secs => ${PROCESSING_LEASE_DURATION_SECONDS}::double precision),
          "claimedBy" = ${workerId},
          attempt = attempt + 1,
          "updatedAt" = now()
      WHERE id = (
        SELECT id
        FROM "DocumentProcessingJob"
        WHERE state = 'QUEUED'
          AND "nextAttemptAt" <= now()
          AND attempt < "maxAttempts"
        ORDER BY "nextAttemptAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, "documentId", "organizationId", "documentGeneration",
                "verifiedStorageKey", attempt, "maxAttempts", "leaseId",
                "leaseExpiresAt"
    `;

    return rows[0] ?? null;
  }

  async recoverExpiredLeases(): Promise<ExpiredLeaseRecovery> {
    return this.prisma.$transaction(async (tx) => {
      const recovered = await tx.$executeRaw`
        UPDATE "DocumentProcessingJob"
        SET state = 'QUEUED',
            "leaseId" = NULL,
            "leaseExpiresAt" = NULL,
            "claimedBy" = NULL,
            "nextAttemptAt" = now(),
            "updatedAt" = now()
        WHERE state = 'CLAIMED'
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < now())
          AND attempt < "maxAttempts"
      `;

      const failed = await tx.$executeRaw`
        UPDATE "DocumentProcessingJob"
        SET state = 'FAILED',
            "leaseId" = NULL,
            "leaseExpiresAt" = NULL,
            "claimedBy" = NULL,
            "lastError" = ${LEASE_EXPIRED_ATTEMPTS_EXHAUSTED},
            "finishedAt" = now(),
            "updatedAt" = now()
        WHERE state = 'CLAIMED'
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < now())
          AND attempt >= "maxAttempts"
      `;

      return { recovered, failed };
    });
  }

  async hasValidLease({ jobId, leaseId }: JobLease): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<ExistsRow[]>`
      SELECT 1 AS ok
      FROM "DocumentProcessingJob"
      WHERE id = ${jobId}::uuid
        AND state = 'CLAIMED'
        AND "leaseId" = ${leaseId}::uuid
        AND "leaseExpiresAt" > now()
      LIMIT 1
    `;

    return rows.length > 0;
  }

  async ownsProcessableDocument(
    ownership: ProcessingOwnership,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<ExistsRow[]>`
      SELECT 1 AS ok
      FROM "DocumentProcessingJob" AS j
      JOIN "Document" AS d ON d.id = j."documentId"
      WHERE j.id = ${ownership.jobId}::uuid
        AND j.state = 'CLAIMED'
        AND j."leaseId" = ${ownership.leaseId}::uuid
        AND j."leaseExpiresAt" > now()
        AND j."organizationId" = ${ownership.organizationId}::uuid
        AND j."documentGeneration" = ${ownership.documentGeneration}
        AND j."verifiedStorageKey" = ${ownership.verifiedStorageKey}
        AND d."organizationId" = ${ownership.organizationId}::uuid
        AND d."generation" = ${ownership.documentGeneration}
        AND d."storageKey" = ${ownership.verifiedStorageKey}
        AND d.status = 'PROCESSING'
      LIMIT 1
    `;

    return rows.length > 0;
  }
}

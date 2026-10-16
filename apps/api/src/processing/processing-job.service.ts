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
  contentType: string | null;
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

export interface ExtractionResult {
  content: string;
  characterCount: number;
}

interface ExistsRow {
  ok: number;
}

interface IdRow {
  id: string;
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
                "leaseExpiresAt",
                (
                  SELECT d."contentType"
                  FROM "Document" AS d
                  WHERE d.id = "DocumentProcessingJob"."documentId"
                    AND d."generation" = "DocumentProcessingJob"."documentGeneration"
                    AND d."storageKey" = "DocumentProcessingJob"."verifiedStorageKey"
                ) AS "contentType"
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

  async renewLease({ jobId, leaseId }: JobLease): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<IdRow[]>`
      UPDATE "DocumentProcessingJob"
      SET "leaseExpiresAt" = now() + make_interval(secs => ${PROCESSING_LEASE_DURATION_SECONDS}::double precision),
          "updatedAt" = now()
      WHERE id = ${jobId}::uuid
        AND state = 'CLAIMED'
        AND "leaseId" = ${leaseId}::uuid
        AND "leaseExpiresAt" > now()
      RETURNING id
    `;

    return rows.length > 0;
  }

  async publishExtraction(
    ownership: ProcessingOwnership,
    result: ExtractionResult,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO "DocumentExtraction"
          ("id", "documentId", "organizationId", "documentGeneration",
           "verifiedStorageKey", "content", "characterCount", "createdAt", "updatedAt")
        SELECT gen_random_uuid(), j."documentId", j."organizationId",
               j."documentGeneration", j."verifiedStorageKey",
               ${result.content}, ${result.characterCount}, now(), now()
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
        ON CONFLICT ("documentId", "documentGeneration") DO NOTHING
      `;

      if (inserted === 0) {
        return false;
      }

      const completed = await tx.$executeRaw`
        UPDATE "DocumentProcessingJob"
        SET state = 'SUCCEEDED',
            "leaseId" = NULL,
            "leaseExpiresAt" = NULL,
            "claimedBy" = NULL,
            "finishedAt" = now(),
            "updatedAt" = now()
        WHERE id = ${ownership.jobId}::uuid
          AND state = 'CLAIMED'
          AND "leaseId" = ${ownership.leaseId}::uuid
      `;

      if (completed === 0) {
        throw new Error(
          `Processing job ${ownership.jobId} changed while publishing its extraction`,
        );
      }

      return true;
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

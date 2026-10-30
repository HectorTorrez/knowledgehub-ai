import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FactCandidate } from './facts.policy.js';

export interface FactsTarget {
  organizationId: string;
  documentId: string;
  documentGeneration: number;
}

export interface FactRecord extends Omit<FactCandidate, 'currency'> {
  currency: string | null;
  factType?: 'CONTRACT_TOTAL' | 'NUMERIC_VALUE';
  field?: string;
  fieldLabel?: string;
  unit?: string;
  entityId?: string;
  entityLabel?: string;
  occurredOn?: Date | null;
  isTotal?: boolean;
  chunkIndex: number | null;
  scale: number;
}

export interface PendingDocument {
  id: string;
  organizationId: string;
  generation: number;
  title: string;
}

export type FactsPublish =
  | { status: 'READY' }
  | { status: 'FAILED'; reason: string };

export interface StoredPage {
  pageNumber: number;
  content: string;
}

export interface StoredChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

interface PageRow {
  pages: unknown;
}

interface ChunkRow {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

interface OwnershipRow {
  id: string;
}

function isStoredPage(value: unknown): value is StoredPage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const page = value as { pageNumber?: unknown; content?: unknown };

  return (
    Number.isInteger(page.pageNumber) &&
    typeof page.content === 'string' &&
    (page.content as string).length > 0
  );
}

export function parseStoredPages(value: unknown): StoredPage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isStoredPage);
}

@Injectable()
export class FactsStore {
  constructor(private readonly prisma: PrismaService) {}

  async replaceForDocument(
    target: FactsTarget,
    facts: FactRecord[],
    publish: FactsPublish = { status: 'READY' },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.$queryRaw<OwnershipRow[]>`
        SELECT id
        FROM "Document"
        WHERE id = ${target.documentId}::uuid
          AND "organizationId" = ${target.organizationId}::uuid
          AND generation = ${target.documentGeneration}
          AND status IN ('PROCESSING', 'READY')
        FOR UPDATE
      `;

      if (owned.length === 0) {
        return false;
      }

      await tx.$executeRaw`
        DELETE FROM "DocumentFact"
        WHERE "documentId" = ${target.documentId}::uuid
          AND "organizationId" = ${target.organizationId}::uuid
          AND "documentGeneration" <= ${target.documentGeneration}
      `;

      if (facts.length > 0) {
        await tx.documentFact.createMany({
          data: facts.map((fact) => ({
            organizationId: target.organizationId,
            documentId: target.documentId,
            documentGeneration: target.documentGeneration,
            factType: fact.factType ?? 'CONTRACT_TOTAL',
            field: fact.field,
            fieldLabel: fact.fieldLabel,
            unit: fact.unit,
            entityId: fact.entityId,
            entityLabel: fact.entityLabel,
            occurredOn: fact.occurredOn,
            isTotal: fact.isTotal,
            naturalKey: fact.naturalKey,
            label: fact.label,
            amountMinor: fact.amountMinor,
            scale: fact.scale,
            currency: fact.currency,
            pageNumber: fact.pageNumber,
            chunkIndex: fact.chunkIndex,
            evidenceText: fact.evidenceText,
          })),
        });
      }

      await tx.$executeRaw`
        UPDATE "Document"
        SET "factsStatus" = ${publish.status}::"FactsStatus",
            "factsFailureReason" = ${
              publish.status === 'FAILED' ? publish.reason : null
            },
            "updatedAt" = now()
        WHERE id = ${target.documentId}::uuid
          AND "organizationId" = ${target.organizationId}::uuid
          AND generation = ${target.documentGeneration}
      `;

      return true;
    });
  }

  async markFailed(target: FactsTarget, reason: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<OwnershipRow[]>`
      UPDATE "Document"
      SET "factsStatus" = 'FAILED',
          "factsFailureReason" = ${reason},
          "updatedAt" = now()
      WHERE id = ${target.documentId}::uuid
        AND "organizationId" = ${target.organizationId}::uuid
        AND generation = ${target.documentGeneration}
        AND "factsStatus" <> 'READY'
      RETURNING id
    `;

    return rows.length > 0;
  }

  async nextPending(limit: number): Promise<PendingDocument[]> {
    return this.prisma.document.findMany({
      where: { status: 'READY', factsStatus: 'PENDING' },
      select: {
        id: true,
        organizationId: true,
        generation: true,
        title: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async loadPages(
    organizationId: string,
    documentId: string,
    generation: number,
  ): Promise<StoredPage[]> {
    const row = await this.prisma.documentExtraction.findFirst({
      where: {
        organizationId,
        documentId,
        documentGeneration: generation,
      },
      select: { pages: true },
    });

    if (!row) {
      return [];
    }

    return parseStoredPages((row as PageRow).pages);
  }

  async loadChunks(
    organizationId: string,
    documentId: string,
    generation: number,
  ): Promise<StoredChunk[]> {
    return this.prisma.documentChunk.findMany({
      where: {
        organizationId,
        documentId,
        documentGeneration: generation,
      },
      select: { chunkIndex: true, pageNumber: true, content: true },
      orderBy: { chunkIndex: 'asc' },
    }) as Promise<ChunkRow[]>;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  AggregateFact,
  AggregateSource,
  ContractTotalsResponse,
} from '@knowledgehub/shared-types';
import { FactsConfig } from '../facts/facts.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ContractTotalsInput } from './dto/contract-totals.schema.js';

const EXCERPT_MAX_CHARS = 300;

interface FactRow {
  factId: string;
  naturalKey: string;
  label: string;
  amountMinor: bigint;
  scale: number;
  currency: string;
  pageNumber: number;
  chunkIndex: number | null;
  evidenceText: string;
  documentId: string;
  documentTitle: string;
  documentCreatedAt: Date;
}

interface ScopeDocument {
  id: string;
  factsStatus: 'PENDING' | 'READY' | 'FAILED';
}

function excerpt(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();

  return collapsed.length <= EXCERPT_MAX_CHARS
    ? collapsed
    : `${collapsed.slice(0, EXCERPT_MAX_CHARS - 1).trimEnd()}…`;
}

function dedupeNewestFirst(rows: FactRow[]): {
  unique: FactRow[];
  collapsed: number;
} {
  const seen = new Set<string>();
  const unique: FactRow[] = [];

  for (const row of rows) {
    const key = `${row.currency}:${row.naturalKey}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(row);
  }

  return { unique, collapsed: rows.length - unique.length };
}

@Injectable()
export class AggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factsConfig: FactsConfig,
  ) {}

  async contractTotals(
    organizationId: string,
    input: ContractTotalsInput,
  ): Promise<ContractTotalsResponse> {
    if (!this.factsConfig.enabled) {
      throw new ServiceUnavailableException('Fact aggregation is not enabled');
    }

    if (input.documentId) {
      await this.assertDocumentInScope(organizationId, input.documentId);
    }

    const [documents, rows] = await Promise.all([
      this.loadScope(organizationId, input.documentId),
      this.loadFacts(organizationId, input),
    ]);

    const coverage = {
      documents: documents.length,
      extracted: documents.filter((document) => document.factsStatus === 'READY')
        .length,
      failed: documents.filter((document) => document.factsStatus === 'FAILED')
        .length,
      pending: documents.filter((document) => document.factsStatus === 'PENDING')
        .length,
    };

    const { unique, collapsed } = dedupeNewestFirst(rows);
    const totals = this.sumByCurrency(unique);
    const breakdown = unique
      .slice(input.offset, input.offset + input.limit)
      .map(toAggregateFact);

    return {
      status:
        coverage.failed === 0 && coverage.pending === 0 ? 'complete' : 'partial',
      coverage,
      collapsedDuplicates: collapsed,
      totalFacts: unique.length,
      totals,
      sources: this.buildSources(unique),
      breakdown,
    };
  }

  private async assertDocumentInScope(
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
      throw new ConflictException('Document is not ready to aggregate');
    }
  }

  private async loadScope(
    organizationId: string,
    documentId?: string,
  ): Promise<ScopeDocument[]> {
    return this.prisma.document.findMany({
      where: {
        organizationId,
        status: 'READY',
        ...(documentId ? { id: documentId } : {}),
      },
      select: { id: true, factsStatus: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async loadFacts(
    organizationId: string,
    input: ContractTotalsInput,
  ): Promise<FactRow[]> {
    if (input.documentId && input.currency) {
      return this.prisma.$queryRaw<FactRow[]>`
        SELECT
          f.id AS "factId", f."naturalKey", f.label, f."amountMinor", f.scale,
          f.currency, f."pageNumber", f."chunkIndex", f."evidenceText",
          d.id AS "documentId", d.title AS "documentTitle",
          d."createdAt" AS "documentCreatedAt"
        FROM "DocumentFact" AS f
        JOIN "Document" AS d ON d.id = f."documentId"
        WHERE f."organizationId" = ${organizationId}::uuid
          AND d."organizationId" = ${organizationId}::uuid
          AND d.status = 'READY'
          AND d.generation = f."documentGeneration"
          AND f."factType" = 'CONTRACT_TOTAL'
          AND f."documentId" = ${input.documentId}::uuid
          AND f.currency = ${input.currency}::char(3)
        ORDER BY d."createdAt" DESC, d.id DESC, f."pageNumber", f."chunkIndex", f."naturalKey"
      `;
    }

    if (input.documentId) {
      return this.prisma.$queryRaw<FactRow[]>`
        SELECT
          f.id AS "factId", f."naturalKey", f.label, f."amountMinor", f.scale,
          f.currency, f."pageNumber", f."chunkIndex", f."evidenceText",
          d.id AS "documentId", d.title AS "documentTitle",
          d."createdAt" AS "documentCreatedAt"
        FROM "DocumentFact" AS f
        JOIN "Document" AS d ON d.id = f."documentId"
        WHERE f."organizationId" = ${organizationId}::uuid
          AND d."organizationId" = ${organizationId}::uuid
          AND d.status = 'READY'
          AND d.generation = f."documentGeneration"
          AND f."factType" = 'CONTRACT_TOTAL'
          AND f."documentId" = ${input.documentId}::uuid
        ORDER BY d."createdAt" DESC, d.id DESC, f."pageNumber", f."chunkIndex", f."naturalKey"
      `;
    }

    if (input.currency) {
      return this.prisma.$queryRaw<FactRow[]>`
        SELECT
          f.id AS "factId", f."naturalKey", f.label, f."amountMinor", f.scale,
          f.currency, f."pageNumber", f."chunkIndex", f."evidenceText",
          d.id AS "documentId", d.title AS "documentTitle",
          d."createdAt" AS "documentCreatedAt"
        FROM "DocumentFact" AS f
        JOIN "Document" AS d ON d.id = f."documentId"
        WHERE f."organizationId" = ${organizationId}::uuid
          AND d."organizationId" = ${organizationId}::uuid
          AND d.status = 'READY'
          AND d.generation = f."documentGeneration"
          AND f."factType" = 'CONTRACT_TOTAL'
          AND f.currency = ${input.currency}::char(3)
        ORDER BY d."createdAt" DESC, d.id DESC, f."pageNumber", f."chunkIndex", f."naturalKey"
      `;
    }

    return this.prisma.$queryRaw<FactRow[]>`
      SELECT
        f.id AS "factId", f."naturalKey", f.label, f."amountMinor", f.scale,
        f.currency, f."pageNumber", f."chunkIndex", f."evidenceText",
        d.id AS "documentId", d.title AS "documentTitle",
        d."createdAt" AS "documentCreatedAt"
      FROM "DocumentFact" AS f
      JOIN "Document" AS d ON d.id = f."documentId"
      WHERE f."organizationId" = ${organizationId}::uuid
        AND d."organizationId" = ${organizationId}::uuid
        AND d.status = 'READY'
        AND d.generation = f."documentGeneration"
        AND f."factType" = 'CONTRACT_TOTAL'
      ORDER BY d."createdAt" DESC, d.id DESC, f."pageNumber", f."chunkIndex", f."naturalKey"
    `;
  }

  private buildSources(rows: FactRow[]): AggregateSource[] {
    const byDocument = new Map<
      string,
      { row: FactRow; minor: bigint; count: number }
    >();

    for (const row of rows) {
      const key = `${row.documentId}:${row.currency}`;
      const current = byDocument.get(key);

      if (current) {
        current.minor += row.amountMinor;
        current.count += 1;
        continue;
      }

      byDocument.set(key, {
        row,
        minor: row.amountMinor,
        count: 1,
      });
    }

    return [...byDocument.values()].map(({ row, minor, count }) => ({
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      currency: row.currency,
      scale: row.scale,
      subtotalMinor: minor.toString(),
      contractCount: count,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      excerpt: excerpt(row.evidenceText),
    }));
  }

  private sumByCurrency(rows: FactRow[]): {
    currency: string;
    scale: number;
    totalMinor: string;
    contractCount: number;
  }[] {
    const totals = new Map<
      string,
      { minor: bigint; count: number; scale: number }
    >();

    for (const row of rows) {
      const current = totals.get(row.currency) ?? {
        minor: 0n,
        count: 0,
        scale: row.scale,
      };

      current.minor += row.amountMinor;
      current.count += 1;
      current.scale = Math.max(current.scale, row.scale);
      totals.set(row.currency, current);
    }

    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, total]) => ({
        currency,
        scale: total.scale,
        totalMinor: total.minor.toString(),
        contractCount: total.count,
      }));
  }
}

function toAggregateFact(row: FactRow): AggregateFact {
  return {
    contractId: row.naturalKey,
    label: row.label,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    scale: row.scale,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    pageNumber: row.pageNumber,
    chunkIndex: row.chunkIndex,
    excerpt: excerpt(row.evidenceText),
  };
}

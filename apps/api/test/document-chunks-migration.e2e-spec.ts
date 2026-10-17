import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MIGRATION_SQL = fileURLToPath(
  new URL(
    '../prisma/migrations/20261016200000_add_document_chunks_and_pages/migration.sql',
    import.meta.url,
  ),
);

function executableStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface BackfilledRow {
  pages: unknown;
  pageCount: number;
  characterCount: number;
}

interface CountRow {
  count: bigint;
}

describe('add_document_chunks_and_pages migration (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('reshapes DocumentExtraction to pages and creates generation-keyed chunks', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;
    const documentId = randomUUID();
    const organizationId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
      );
      await tx.$executeRawUnsafe(`
        CREATE TABLE "DocumentExtraction" (
          "id" UUID PRIMARY KEY,
          "documentId" UUID NOT NULL,
          "organizationId" UUID NOT NULL,
          "documentGeneration" INTEGER NOT NULL,
          "verifiedStorageKey" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "characterCount" INTEGER NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "DocumentExtraction_documentId_documentGeneration_key"
            UNIQUE ("documentId", "documentGeneration")
        )
      `);
      await tx.$executeRawUnsafe(
        `INSERT INTO "Document" ("id", "status") VALUES ($1, 'PROCESSING')`,
        documentId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "DocumentExtraction"
           ("id", "documentId", "organizationId", "documentGeneration", "verifiedStorageKey", "content", "characterCount", "updatedAt")
         VALUES ($1, $2, $3, 1, 'organizations/verified', 'legacy text', 11, now())`,
        randomUUID(),
        documentId,
        organizationId,
      );

      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }

      const columns = await tx.$queryRawUnsafe<ColumnRow[]>(
        `SELECT "column_name", "data_type", "is_nullable"
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'DocumentExtraction'`,
        schema,
      );
      const names = columns.map((column) => column.column_name);
      expect(names).not.toContain('content');
      const pages = columns.find((column) => column.column_name === 'pages');
      expect(pages?.data_type).toBe('jsonb');
      expect(pages?.is_nullable).toBe('NO');
      const pageCount = columns.find(
        (column) => column.column_name === 'pageCount',
      );
      expect(pageCount?.data_type).toBe('integer');
      expect(pageCount?.is_nullable).toBe('NO');

      const backfilled = await tx.$queryRawUnsafe<BackfilledRow[]>(
        'SELECT "pages", "pageCount", "characterCount" FROM "DocumentExtraction"',
      );
      expect(backfilled).toEqual([
        { pages: [], pageCount: 0, characterCount: 11 },
      ]);
    });

    const insertChunk = (
      index: number,
      generation = 1,
      chunkDocumentId = documentId,
    ) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."DocumentChunk"
           ("id", "documentId", "organizationId", "documentGeneration", "pageNumber", "chunkIndex", "content", "characterCount", "updatedAt")
         VALUES ($1, $2, $3, $4, 1, $5, 'chunk', 5, now())`,
        randomUUID(),
        chunkDocumentId,
        organizationId,
        generation,
        index,
      );

    await insertChunk(0);
    await expect(insertChunk(0)).rejects.toThrow();
    await insertChunk(1);
    await insertChunk(0, 2);

    const chunks = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*) FROM "${schema}"."DocumentChunk" WHERE "documentId" = $1`,
      documentId,
    );
    expect(Number(chunks[0]?.count)).toBe(3);

    await prisma.$executeRawUnsafe(
      `DELETE FROM "${schema}"."Document" WHERE "id" = $1`,
      documentId,
    );

    const remaining = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*) FROM "${schema}"."DocumentChunk"`,
    );
    expect(Number(remaining[0]?.count)).toBe(0);

    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
});

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MIGRATION_SQL = fileURLToPath(
  new URL(
    '../prisma/migrations/20261016190000_add_document_extractions/migration.sql',
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

interface CountRow {
  count: bigint;
}

describe('add_document_extractions migration (e2e)', () => {
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

  it('stores one extraction per document generation and cascades with the document', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;
    const documentId = randomUUID();
    const organizationId = randomUUID();

    const insertExtraction = (
      generation: number,
      content: string,
    ): Promise<number> =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."DocumentExtraction"
           ("id", "documentId", "organizationId", "documentGeneration", "verifiedStorageKey", "content", "characterCount", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'organizations/verified', $5, $6, now(), now())`,
        randomUUID(),
        documentId,
        organizationId,
        generation,
        content,
        content.length,
      );

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
      );
      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "${schema}"."Document" ("id", "status") VALUES ($1, 'PROCESSING')`,
        documentId,
      );
    });

    await insertExtraction(1, 'first generation');
    await expect(insertExtraction(1, 'duplicate generation')).rejects.toThrow();
    await insertExtraction(2, 'second generation');

    const rows = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*) FROM "${schema}"."DocumentExtraction" WHERE "documentId" = $1`,
      documentId,
    );
    expect(Number(rows[0]?.count)).toBe(2);

    await prisma.$executeRawUnsafe(
      `DELETE FROM "${schema}"."Document" WHERE "id" = $1`,
      documentId,
    );

    const remaining = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*) FROM "${schema}"."DocumentExtraction"`,
    );
    expect(Number(remaining[0]?.count)).toBe(0);

    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
});

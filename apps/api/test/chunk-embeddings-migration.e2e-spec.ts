import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MIGRATION_SQL = fileURLToPath(
  new URL(
    '../prisma/migrations/20261016210000_add_chunk_embeddings/migration.sql',
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

const CHUNK_TABLE_WITHOUT_EMBEDDING = `
  CREATE TABLE "DocumentChunk" (
    "id" UUID PRIMARY KEY,
    "documentId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentGeneration" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )
`;

const VECTOR_LITERAL = `[${Array.from({ length: 1536 }, () => '0').join(',')}]`;

interface ColumnRow {
  type: string;
  not_null: boolean;
}

describe('add_chunk_embeddings migration (e2e)', () => {
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

  it('adds a NOT NULL 1536-dimension vector column to an empty chunk table', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;
    const documentId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
      );
      await tx.$executeRawUnsafe(CHUNK_TABLE_WITHOUT_EMBEDDING);

      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }

      const columns = await tx.$queryRawUnsafe<ColumnRow[]>(
        `SELECT format_type(a.atttypid, a.atttypmod) AS type,
                a.attnotnull AS not_null
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = 'DocumentChunk'
           AND a.attname = 'embedding'`,
        schema,
      );
      expect(columns).toEqual([{ type: 'vector(1536)', not_null: true }]);

      await tx.$executeRawUnsafe(
        `INSERT INTO "DocumentChunk"
           ("id", "documentId", "organizationId", "documentGeneration",
            "pageNumber", "chunkIndex", "content", "characterCount", "embedding", "updatedAt")
         VALUES ($1, $2, $3, 1, 1, 0, 'chunk', 5, $4::vector, now())`,
        randomUUID(),
        documentId,
        randomUUID(),
        VECTOR_LITERAL,
      );

      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });

  it('fails safely rather than backfilling when chunk rows already exist', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(
          `SET LOCAL search_path TO "${schema}", public`,
        );
        await tx.$executeRawUnsafe(
          'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
        );
        await tx.$executeRawUnsafe(CHUNK_TABLE_WITHOUT_EMBEDDING);
        await tx.$executeRawUnsafe(
          `INSERT INTO "DocumentChunk"
             ("id", "documentId", "organizationId", "documentGeneration",
              "pageNumber", "chunkIndex", "content", "characterCount", "updatedAt")
           VALUES ($1, $2, $3, 1, 1, 0, 'preexisting', 11, now())`,
          randomUUID(),
          randomUUID(),
          randomUUID(),
        );

        for (const statement of executableStatements(sql)) {
          await tx.$executeRawUnsafe(statement);
        }
      }),
    ).rejects.toThrow();
  });
});

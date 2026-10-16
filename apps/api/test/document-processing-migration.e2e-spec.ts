import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MIGRATION_SQL = fileURLToPath(
  new URL(
    '../prisma/migrations/20261016161745_add_document_processing_jobs/migration.sql',
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

interface MigratedRow {
  id: string;
  status: string;
  generation: number;
  failureKind: string | null;
}

interface IndexRow {
  indexname: string;
}

describe('add_document_processing_jobs migration (e2e)', () => {
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

  it('adds generation and failure kinds, backfills verification failures, and creates partial indexes', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;
    const failedId = '00000000-0000-0000-0000-000000000001';
    const pendingId = '00000000-0000-0000-0000-000000000002';

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Document" ("id", "status") VALUES
           ('${failedId}', 'FAILED'),
           ('${pendingId}', 'PENDING')`,
      );

      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }

      const rows = await tx.$queryRawUnsafe<MigratedRow[]>(
        'SELECT "id", "status", "generation", "failureKind" FROM "Document" ORDER BY "id"',
      );

      expect(rows).toEqual([
        {
          id: failedId,
          status: 'FAILED',
          generation: 0,
          failureKind: 'VERIFICATION',
        },
        {
          id: pendingId,
          status: 'PENDING',
          generation: 0,
          failureKind: null,
        },
      ]);

      const indexes = await tx.$queryRawUnsafe<IndexRow[]>(
        'SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname',
        schema,
        'DocumentProcessingJob',
      );

      expect(indexes.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'DocumentProcessingJob_documentId_key',
          'DocumentProcessingJob_nextAttemptAt_id_idx',
          'DocumentProcessingJob_documentId_documentGeneration_idx',
          'DocumentProcessingJob_organizationId_state_idx',
        ]),
      );

      const partialUnique = await tx.$queryRawUnsafe<{ indexdef: string }[]>(
        'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
        schema,
        'DocumentProcessingJob_documentId_key',
      );
      expect(partialUnique[0]?.indexdef).toContain(
        "WHERE (state = ANY (ARRAY['QUEUED'::\"ProcessingJobState\", 'CLAIMED'::\"ProcessingJobState\"]))",
      );

      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });

  it('allows one active job per document while permitting many terminal jobs', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" UUID PRIMARY KEY, "status" TEXT)',
      );
      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const documentId = randomUUID();
    const organizationId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schema}"."Document" ("id", "status") VALUES ($1, 'PROCESSING')`,
      documentId,
    );

    const insertJob = (state: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."DocumentProcessingJob"
           ("id", "documentId", "organizationId", "documentGeneration", "verifiedStorageKey", "state", "maxAttempts", "updatedAt")
         VALUES ($1, $2, $3, 1, 'organizations/verified', $4::"${schema}"."ProcessingJobState", 5, now())`,
        randomUUID(),
        documentId,
        organizationId,
        state,
      );

    await insertJob('QUEUED');
    await expect(insertJob('QUEUED')).rejects.toThrow();
    await expect(insertJob('CLAIMED')).rejects.toThrow();

    await prisma.$executeRawUnsafe(
      `UPDATE "${schema}"."DocumentProcessingJob" SET "state" = 'SUCCEEDED' WHERE "documentId" = $1`,
      documentId,
    );

    await insertJob('QUEUED');

    const active = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) FROM "${schema}"."DocumentProcessingJob"
       WHERE "documentId" = $1 AND "state" IN ('QUEUED', 'CLAIMED')`,
      documentId,
    );
    expect(Number(active[0]?.count)).toBe(1);

    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
});

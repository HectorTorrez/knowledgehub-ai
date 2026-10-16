import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MIGRATION_SQL = fileURLToPath(
  new URL(
    '../prisma/migrations/20261016152748_add_upload_storage_key/migration.sql',
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
  storageKey: string | null;
  uploadStorageKey: string | null;
}

describe('add_upload_storage_key migration (e2e)', () => {
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

  it('moves unverified storage keys into uploadStorageKey and clears storageKey', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" TEXT PRIMARY KEY, "storageKey" TEXT)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Document" ("id", "storageKey") VALUES
           ('legacy', 'organizations/legacy/documents/token'),
           ('unused', NULL)`,
      );

      for (const statement of executableStatements(sql)) {
        await tx.$executeRawUnsafe(statement);
      }

      const rows = await tx.$queryRawUnsafe<MigratedRow[]>(
        'SELECT "id", "storageKey", "uploadStorageKey" FROM "Document" ORDER BY "id"',
      );

      expect(rows).toEqual([
        {
          id: 'legacy',
          storageKey: null,
          uploadStorageKey: 'organizations/legacy/documents/token',
        },
        { id: 'unused', storageKey: null, uploadStorageKey: null },
      ]);

      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });

  it('leaves already-migrated rows untouched when the backfill runs again', async () => {
    const sql = await readFile(MIGRATION_SQL, 'utf8');
    const backfill = executableStatements(sql).filter((statement) =>
      statement.toUpperCase().startsWith('UPDATE'),
    );
    const schema = `migration_test_${randomUUID().replace(/-/g, '')}`;

    expect(backfill).toHaveLength(1);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Document" ("id" TEXT PRIMARY KEY, "storageKey" TEXT, "uploadStorageKey" TEXT)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Document" ("id", "storageKey", "uploadStorageKey")
           VALUES ('verified', NULL, 'organizations/verified/documents/token')`,
      );

      for (const statement of backfill) {
        await tx.$executeRawUnsafe(statement);
      }

      const rows = await tx.$queryRawUnsafe<MigratedRow[]>(
        'SELECT "id", "storageKey", "uploadStorageKey" FROM "Document"',
      );

      expect(rows).toEqual([
        {
          id: 'verified',
          storageKey: null,
          uploadStorageKey: 'organizations/verified/documents/token',
        },
      ]);

      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });
});

import type { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StorageConfig } from '../storage/storage.config.js';
import { ObjectVersionMismatchError } from '../storage/object-storage.port.js';
import { FakeObjectStorage } from '../../test/support/fake-object-storage.js';
import { DocumentsService } from './documents.service.js';
import { MAX_UPLOAD_BYTES } from './upload-policy.js';

type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
type DocumentFailureKind = 'VERIFICATION' | 'PROCESSING';

interface DocumentRecord {
  id: string;
  organizationId: string;
  title: string;
  status: DocumentStatus;
  generation: number;
  uploadStorageKey: string | null;
  expectedContentType: string | null;
  storageKey: string | null;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  failureKind: DocumentFailureKind | null;
  createdAt: Date;
  updatedAt: Date;
}

const STAGING_KEY = 'organizations/org-1/documents/doc-1/staging-token';
const encoder = new TextEncoder();

function documentRecord(
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord {
  return {
    id: 'doc-1',
    organizationId: 'org-1',
    title: 'Quarterly report',
    status: 'PENDING',
    generation: 0,
    uploadStorageKey: STAGING_KEY,
    expectedContentType: 'application/pdf',
    storageKey: null,
    originalFileName: null,
    contentType: null,
    sizeBytes: null,
    failureReason: null,
    failureKind: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function organizationContext(
  role: 'OWNER' | 'MEMBER' = 'OWNER',
): OrganizationContext {
  return {
    organizationId: 'org-1',
    userId: 'uploader-1',
    role,
    organization: {
      id: 'org-1',
      name: 'Acme',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };
}

function storageConfig(uploadTtlSeconds = 900): StorageConfig {
  const config = {
    getOrThrow: (key: string) =>
      key === 'STORAGE_UPLOAD_TTL_SECONDS' ? uploadTtlSeconds : undefined,
  } as unknown as ConfigService;

  return new StorageConfig(config);
}

interface HarnessOptions {
  created?: DocumentRecord;
  rows?: DocumentRecord[];
  findFirst?: DocumentRecord | null;
  uploadTtlSeconds?: number;
}

interface UpdateManyArgs {
  where: {
    id: string;
    organizationId: string;
    uploadStorageKey?: string;
    status?: DocumentStatus | { in: DocumentStatus[] };
  };
  data: Record<string, unknown>;
}

function isIncrement(value: unknown): value is { increment: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'increment' in value &&
    typeof (value as { increment: unknown }).increment === 'number'
  );
}

function applyUpdate(
  state: DocumentRecord,
  data: Record<string, unknown>,
): void {
  const target = state as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    target[key] = isIncrement(value)
      ? (target[key] as number) + value.increment
      : value;
  }
}

function createHarness(options: HarnessOptions = {}) {
  const prisma = {
    document: {
      create: vi.fn(
        async (_args: { data: Record<string, unknown> }) =>
          options.created ?? documentRecord(),
      ),
      findMany: vi.fn(async (_args: unknown) => options.rows ?? []),
      findFirst: vi.fn(
        async (_args: { where: unknown; select?: unknown }) =>
          options.findFirst === undefined
            ? documentRecord()
            : options.findFirst,
      ),
      update: vi.fn(
        async (_args: { where: unknown; data: Record<string, unknown> }) =>
          options.created ?? documentRecord(),
      ),
      updateMany: vi.fn(async (_args: UpdateManyArgs) => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };

  const storage = new FakeObjectStorage();
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage,
    storageConfig(options.uploadTtlSeconds),
  );

  return { service, prisma, storage };
}

function createCompletionHarness(
  record: DocumentRecord = documentRecord(),
  storage: FakeObjectStorage = new FakeObjectStorage(),
) {
  const state: DocumentRecord = { ...record };

  const prisma = {
    document: {
      findFirst: vi.fn(
        async (): Promise<DocumentRecord | null> => ({ ...state }),
      ),
      findFirstOrThrow: vi.fn(
        async (): Promise<DocumentRecord | null> => ({ ...state }),
      ),
      updateMany: vi.fn(async ({ where, data }: UpdateManyArgs) => {
        const matchesKey =
          where.uploadStorageKey === undefined ||
          where.uploadStorageKey === state.uploadStorageKey;
        const matchesStatus =
          where.status === undefined ||
          (typeof where.status === 'string'
            ? state.status === where.status
            : where.status.in.includes(state.status));
        const matches =
          where.id === state.id &&
          where.organizationId === state.organizationId &&
          matchesKey &&
          matchesStatus;

        if (!matches) {
          return { count: 0 };
        }

        applyUpdate(state, data);
        state.updatedAt = new Date(state.updatedAt.getTime() + 1_000);
        return { count: 1 };
      }),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    documentProcessingJob: {
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
    },
    $transaction: vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const snapshot: DocumentRecord = { ...state };
        try {
          return await callback(prisma);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      },
    ),
  };

  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    storage,
    storageConfig(),
  );

  return {
    service,
    prisma,
    storage,
    state,
  };
}

const PUBLIC_DOCUMENT_FIELDS = [
  'contentType',
  'createdAt',
  'failureKind',
  'failureReason',
  'id',
  'originalFileName',
  'sizeBytes',
  'status',
  'title',
  'updatedAt',
].sort();

describe('DocumentsService.create', () => {
  it('returns the created document with the PENDING status and ISO timestamps', async () => {
    const { service } = createHarness();

    const result = await service.create(organizationContext(), {
      title: 'Quarterly report',
    });

    expect(result).toEqual({
      document: {
        id: 'doc-1',
        title: 'Quarterly report',
        status: 'PENDING',
        originalFileName: null,
        contentType: null,
        sizeBytes: null,
        failureReason: null,
        failureKind: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('writes the organization and uploader from the authorized context, never the input', async () => {
    const { service, prisma } = createHarness();

    await service.create(organizationContext(), { title: 'Quarterly report' });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'org-1',
          uploadedById: 'uploader-1',
          title: 'Quarterly report',
        },
      }),
    );
  });

  it('relies on the model default for the initial status', async () => {
    const { service, prisma } = createHarness();

    await service.create(organizationContext(), { title: 'Quarterly report' });

    const data = prisma.document.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty('status');
  });

  it('does not expose internal fields in the response', async () => {
    const { service } = createHarness();

    const result = await service.create(organizationContext(), {
      title: 'Quarterly report',
    });

    expect(Object.keys(result.document).sort()).toEqual(PUBLIC_DOCUMENT_FIELDS);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('organizationId');
  });
});

describe('DocumentsService.list', () => {
  it('scopes the query to the authorized organization with a deterministic order', async () => {
    const { service, prisma } = createHarness({ rows: [] });

    await service.list('org-1', { limit: 25, order: 'createdAt_desc' });

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: {
        id: true,
        title: true,
        status: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
        failureReason: true,
        failureKind: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 26,
    });
  });

  it('returns an empty list and a null cursor for a newly created organization', async () => {
    const { service } = createHarness({ rows: [] });

    await expect(service.list('org-1', { limit: 25, order: 'createdAt_desc' })).resolves.toEqual({
      documents: [],
      nextCursor: null,
    });
  });

  it('maps each row to the public summary shape', async () => {
    const { service } = createHarness({
      rows: [
        documentRecord({ id: 'doc-2', title: 'Second' }),
        documentRecord({ id: 'doc-1', title: 'First' }),
      ],
    });

    const result = await service.list('org-1', { limit: 25, order: 'createdAt_desc' });

    expect(result.documents).toEqual([
      {
        id: 'doc-2',
        title: 'Second',
        status: 'PENDING',
        originalFileName: null,
        contentType: null,
        sizeBytes: null,
        failureReason: null,
        failureKind: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'doc-1',
        title: 'First',
        status: 'PENDING',
        originalFileName: null,
        contentType: null,
        sizeBytes: null,
        failureReason: null,
        failureKind: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('issues a cursor when more rows exist than the limit', async () => {
    const first = documentRecord({ id: 'doc-1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
    const second = documentRecord({ id: 'doc-2', createdAt: new Date('2026-01-02T00:00:00.000Z') });
    const { service } = createHarness({ rows: [second, first] });

    const result = await service.list('org-1', { limit: 1, order: 'createdAt_desc' });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-2');
    expect(result.nextCursor).not.toBeNull();
  });

  it('filters rows after the cursor when one is supplied', async () => {
    const { service, prisma } = createHarness({ rows: [] });
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-01-01T00:00:00.000Z', id: 'doc-9' }),
    ).toString('base64url');

    await service.list('org-1', { limit: 25, order: 'createdAt_desc', cursor });

    const args = prisma.document.findMany.mock.calls[0][0] as {
      where: { organizationId: string; OR: unknown[] };
    };
    expect(args.where).toEqual({
      organizationId: 'org-1',
      OR: [
        { createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          id: { lt: 'doc-9' },
        },
      ],
    });
  });

  it('filters by title query case-insensitively', async () => {
    const { service, prisma } = createHarness({ rows: [] });

    await service.list('org-1', { limit: 25, order: 'createdAt_desc', q: 'handbook' });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          title: { contains: 'handbook', mode: 'insensitive' },
        },
      }),
    );
  });

  it('filters by status', async () => {
    const { service, prisma } = createHarness({ rows: [] });

    await service.list('org-1', { limit: 25, order: 'createdAt_desc', status: 'READY' });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', status: 'READY' },
      }),
    );
  });

  it('sorts ascending and filters the cursor in the same direction', async () => {
    const { service, prisma } = createHarness({ rows: [] });
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-01-01T00:00:00.000Z', id: 'doc-9' }),
    ).toString('base64url');

    await service.list('org-1', { limit: 25, order: 'createdAt_asc', cursor });

    const args = prisma.document.findMany.mock.calls[0][0] as {
      orderBy: unknown[];
      where: { organizationId: string; OR: unknown[] };
    };
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(args.where).toEqual({
      organizationId: 'org-1',
      OR: [
        { createdAt: { gt: new Date('2026-01-01T00:00:00.000Z') } },
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          id: { gt: 'doc-9' },
        },
      ],
    });
  });

  it('rejects a malformed cursor with 400 without querying the database', async () => {
    const { service, prisma } = createHarness({ rows: [] });

    await expect(
      service.list('org-1', { limit: 25, order: 'createdAt_desc', cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('does not expose internal fields in the response', async () => {
    const { service } = createHarness({
      rows: [documentRecord({ id: 'doc-1' })],
    });

    const result = await service.list('org-1', { limit: 25, order: 'createdAt_desc' });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('organizationId');
  });
});

describe('DocumentsService.getDetail', () => {
  it('looks the document up by both document id and organization id', async () => {
    const { service, prisma } = createHarness();

    await service.getDetail('org-1', 'doc-1');

    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
      }),
    );
  });

  it('returns 404 when the document does not exist in the organization', async () => {
    const { service } = createHarness({ findFirst: null });

    await expect(service.getDetail('org-1', 'doc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not expose internal fields in the response', async () => {
    const { service } = createHarness();

    const result = await service.getDetail('org-1', 'doc-1');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('organizationId');
  });
});

describe('DocumentsService.rename', () => {
  it('renames the document scoped to its organization', async () => {
    const { service, prisma } = createHarness();

    await service.rename('org-1', 'doc-1', { title: 'New title' });

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-1' },
      data: { title: 'New title' },
    });
  });

  it('returns the renamed document', async () => {
    const { service } = createHarness({
      findFirst: documentRecord({ title: 'New title' }),
    });

    const result = await service.rename('org-1', 'doc-1', {
      title: 'New title',
    });

    expect(result.document.title).toBe('New title');
  });

  it('returns 404 when the document does not exist in the organization', async () => {
    const { service, prisma } = createHarness();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.rename('org-1', 'doc-1', { title: 'New title' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DocumentsService.delete', () => {
  it('returns 404 without deleting anything when the document is not found', async () => {
    const { service, prisma, storage } = createHarness({ findFirst: null });
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await expect(service.delete('org-1', 'doc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletes the document row scoped to its organization', async () => {
    const { service, prisma } = createHarness();

    await service.delete('org-1', 'doc-1');

    expect(prisma.document.deleteMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-1' },
    });
  });

  it('deletes both the staging and verified objects', async () => {
    const verifiedKey = 'organizations/org-1/documents/doc-1/verified/token';
    const { service, storage } = createHarness({
      findFirst: documentRecord({ storageKey: verifiedKey }),
    });
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await service.delete('org-1', 'doc-1');

    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledWith(STAGING_KEY);
    expect(deleteObject).toHaveBeenCalledWith(verifiedKey);
  });

  it('deletes only the keys that are present', async () => {
    const { service, storage } = createHarness({
      findFirst: documentRecord({ uploadStorageKey: null, storageKey: null }),
    });
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await service.delete('org-1', 'doc-1');

    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('resolves even when object deletion fails', async () => {
    const { service, storage } = createHarness();
    vi.spyOn(storage, 'deleteObject').mockRejectedValueOnce(
      new Error('storage down'),
    );

    await expect(service.delete('org-1', 'doc-1')).resolves.toBeUndefined();
  });
});

describe('DocumentsService.createUploadUrl', () => {
  const input = { contentType: 'application/pdf' } as const;

  it('looks the document up within the authorized organization', async () => {
    const { service, prisma } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-1' },
      select: { id: true, status: true, uploadStorageKey: true },
    });
  });

  it('returns a presigned PUT upload for the requested content type', async () => {
    const { service } = createHarness();

    const result = await service.createUploadUrl(
      organizationContext(),
      'doc-1',
      input,
    );

    expect(result).toEqual({
      uploadUrl: expect.stringContaining('https://fake-object-storage.test/'),
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      expiresAt: '2026-01-01T00:15:00.000Z',
      maxSizeBytes: MAX_UPLOAD_BYTES,
    });
  });

  it('returns 404 without touching storage or the document when it is not found', async () => {
    const { service, prisma, storage } = createHarness({ findFirst: null });

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.calls).toHaveLength(0);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a document that has already started processing with 409 and touches nothing', async () => {
    const { service, prisma, storage } = createHarness({
      findFirst: documentRecord({ status: 'PROCESSING' }),
    });

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.calls).toHaveLength(0);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a READY document with 409', async () => {
    const { service, storage } = createHarness({
      findFirst: documentRecord({ status: 'READY' }),
    });

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.calls).toHaveLength(0);
  });

  it('rejects a declared size above the policy cap with 413 without touching storage or the document', async () => {
    const { service, prisma, storage } = createHarness();

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', {
        ...input,
        sizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(storage.calls).toHaveLength(0);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('persists the fresh staging key and expected type, leaving lifecycle and file metadata untouched', async () => {
    const { service, prisma, storage } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', {
      ...input,
      sizeBytes: 1024,
    });

    const key = storage.calls[0].key;
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        organizationId: 'org-1',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { uploadStorageKey: key, expectedContentType: 'application/pdf' },
    });

    const args = prisma.document.updateMany.mock.calls[0][0];
    expect(Object.keys(args.data).sort()).toEqual([
      'expectedContentType',
      'uploadStorageKey',
    ]);
    expect(args.data).not.toHaveProperty('storageKey');
    expect(args.data).not.toHaveProperty('status');
    expect(args.data).not.toHaveProperty('contentType');
    expect(args.data).not.toHaveProperty('sizeBytes');
  });

  it('rejects the request with 409 when a concurrent completion wins the update', async () => {
    const { service, prisma } = createHarness();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('passes the configured upload TTL to the storage port', async () => {
    const { service, storage } = createHarness({ uploadTtlSeconds: 120 });

    await service.createUploadUrl(organizationContext(), 'doc-1', {
      contentType: 'text/plain',
    });

    expect(storage.calls[0].expiresInSeconds).toBe(120);
  });

  it('generates a fresh key on every request', async () => {
    const { service, storage } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', input);
    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    expect(storage.calls).toHaveLength(2);
    expect(storage.calls[0].key).not.toBe(storage.calls[1].key);
    expect(storage.calls[0].key).toMatch(
      /^organizations\/org-1\/documents\/doc-1\//,
    );
  });

  it('requests the presigned URL before persisting the key', async () => {
    const { service, prisma, storage } = createHarness();
    const presign = vi.spyOn(storage, 'createPresignedUpload');

    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    expect(presign.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.document.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('does not return a response when persisting the key fails', async () => {
    const { service, prisma } = createHarness();
    prisma.document.updateMany.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toThrow('write failed');
  });

  it('does not expose the raw storage key as a separate response field', async () => {
    const { service } = createHarness();

    const result = await service.createUploadUrl(
      organizationContext(),
      'doc-1',
      input,
    );

    expect(Object.keys(result).sort()).toEqual(
      ['expiresAt', 'headers', 'maxSizeBytes', 'method', 'uploadUrl'].sort(),
    );
  });

  it('deletes the superseded staging object after persisting a new upload URL', async () => {
    const { service, storage } = createHarness();
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    expect(deleteObject).toHaveBeenCalledWith(STAGING_KEY);
  });

  it('leaves the previous staging object alone when the update is superseded', async () => {
    const { service, prisma, storage } = createHarness();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 });
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('DocumentsService.completeUpload', () => {
  function seedValidPdf(storage: FakeObjectStorage): void {
    storage.putObject(
      STAGING_KEY,
      '%PDF-1.7\nverified body',
      'application/pdf',
    );
  }

  it('looks the document up by both document id and organization id', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma } = createCompletionHarness(documentRecord(), storage);

    await service.completeUpload(organizationContext(), 'doc-1', {});

    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
      }),
    );
  });

  it('returns 404 for a document outside the organization', async () => {
    const { service, prisma } = createCompletionHarness();
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['PROCESSING', 'READY'] as const)(
    'short-circuits a %s document without touching storage or the database',
    async (status) => {
      const { service, prisma, storage } = createCompletionHarness(
        documentRecord({ status }),
      );

      const result = await service.completeUpload(
        organizationContext(),
        'doc-1',
        {},
      );

      expect(result.document.status).toBe(status);
      expect(storage.calls).toHaveLength(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.document.updateMany).not.toHaveBeenCalled();
      expect(prisma.documentProcessingJob.create).not.toHaveBeenCalled();
    },
  );

  it('rejects with 409 when no upload URL was requested', async () => {
    const { service, prisma } = createCompletionHarness(
      documentRecord({ uploadStorageKey: null, expectedContentType: null }),
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the expected content type is missing', async () => {
    const { service } = createCompletionHarness(
      documentRecord({ expectedContentType: null }),
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed with 503 when the persisted staging key is malformed', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma } = createCompletionHarness(
      documentRecord({
        uploadStorageKey: 'organizations/org-2/documents/doc-1/token',
      }),
      storage,
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the object is absent without changing state', async () => {
    const { service, prisma, state } = createCompletionHarness();

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(state.status).toBe('PENDING');
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('records EMPTY_OBJECT for a zero-byte object', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(STAGING_KEY, new Uint8Array(), 'application/pdf');
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.status).toBe('FAILED');
    expect(result.document.failureReason).toBe('EMPTY_OBJECT');
    expect(result.document.failureKind).toBe('VERIFICATION');
    expect(state.storageKey).toBeNull();
    expect(prisma.document.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      failureReason: 'EMPTY_OBJECT',
      failureKind: 'VERIFICATION',
    });
  });

  it('records SIZE_LIMIT_EXCEEDED when the real size exceeds the cap', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    storage.inspectObject = async (key) => ({
      key,
      sizeBytes: MAX_UPLOAD_BYTES + 1,
      contentType: 'application/pdf',
      version: 'version-1',
    });
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.failureReason).toBe('SIZE_LIMIT_EXCEEDED');
    expect(result.document.failureKind).toBe('VERIFICATION');
    expect(state.storageKey).toBeNull();
  });

  it('records CONTENT_TYPE_NOT_ALLOWED when the real type is not allowlisted', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    storage.inspectObject = async (key) => ({
      key,
      sizeBytes: 10,
      contentType: 'image/png',
      version: 'version-1',
    });
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.failureReason).toBe('CONTENT_TYPE_NOT_ALLOWED');
    expect(result.document.failureKind).toBe('VERIFICATION');
    expect(state.storageKey).toBeNull();
  });

  it('records CONTENT_TYPE_MISMATCH when the real type differs from the signed type', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(STAGING_KEY, 'plain text body', 'text/plain');
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.failureReason).toBe('CONTENT_TYPE_MISMATCH');
    expect(result.document.failureKind).toBe('VERIFICATION');
    expect(state.storageKey).toBeNull();
  });

  it('records SIGNATURE_MISMATCH when the bytes do not match the signed type', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(STAGING_KEY, 'not actually a pdf', 'application/pdf');
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.failureReason).toBe('SIGNATURE_MISMATCH');
    expect(result.document.failureKind).toBe('VERIFICATION');
    expect(state.storageKey).toBeNull();
  });

  it('promotes a valid object and transitions to PROCESSING with verified metadata', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(state.status).toBe('PROCESSING');
    expect(state.contentType).toBe('application/pdf');
    expect(state.sizeBytes).toBe(encoder.encode('%PDF-1.7\nverified body').byteLength);
    expect(state.failureReason).toBeNull();
    expect(state.failureKind).toBeNull();
    expect(state.storageKey).not.toBeNull();
    expect(state.storageKey).not.toBe(STAGING_KEY);
    expect(state.storageKey).toMatch(
      /^organizations\/org-1\/documents\/doc-1\/verified\//,
    );
    expect(result.document.status).toBe('PROCESSING');
    expect(result.document.failureReason).toBeNull();
    expect(result.document.failureKind).toBeNull();

    const args = prisma.document.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'doc-1',
      organizationId: 'org-1',
      uploadStorageKey: STAGING_KEY,
      status: { in: ['PENDING', 'FAILED'] },
    });
    expect(args.data).toMatchObject({
      status: 'PROCESSING',
      failureReason: null,
      failureKind: null,
      generation: { increment: 1 },
    });

    expect(state.generation).toBe(1);
    expect(prisma.documentProcessingJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentProcessingJob.create.mock.calls[0][0].data).toMatchObject(
      {
        documentId: 'doc-1',
        organizationId: 'org-1',
        documentGeneration: 1,
        verifiedStorageKey: state.storageKey,
        state: 'QUEUED',
        attempt: 0,
      },
    );
  });

  it('enqueues the next generation after a verification failure', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma, state } = createCompletionHarness(
      documentRecord({
        status: 'FAILED',
        generation: 1,
        failureReason: 'SIGNATURE_MISMATCH',
        failureKind: 'VERIFICATION',
      }),
      storage,
    );

    await service.completeUpload(organizationContext(), 'doc-1', {});

    expect(state.generation).toBe(2);
    expect(prisma.documentProcessingJob.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.documentProcessingJob.create.mock.calls[0][0].data,
    ).toMatchObject({ documentGeneration: 2 });
  });

  it('rolls back the transition and generation when job creation fails', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );
    prisma.documentProcessingJob.create.mockRejectedValueOnce(
      new Error('job insert failed'),
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toThrow('job insert failed');

    expect(state.status).toBe('PENDING');
    expect(state.generation).toBe(0);
    expect(state.storageKey).toBeNull();
    expect(state.contentType).toBeNull();
    expect(state.sizeBytes).toBeNull();
  });

  it('does not create a job for a verification failure', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(STAGING_KEY, 'not actually a pdf', 'application/pdf');
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    await service.completeUpload(organizationContext(), 'doc-1', {});

    expect(state.status).toBe('FAILED');
    expect(state.generation).toBe(0);
    expect(prisma.documentProcessingJob.create).not.toHaveBeenCalled();
  });

  it('stores a declared original file name only when supplied', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    await service.completeUpload(organizationContext(), 'doc-1', {
      originalFileName: 'report.pdf',
    });

    expect(state.originalFileName).toBe('report.pdf');
  });

  it('leaves originalFileName untouched when the client does not declare one', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma } = createCompletionHarness(documentRecord(), storage);

    await service.completeUpload(organizationContext(), 'doc-1', {});

    const args = prisma.document.updateMany.mock.calls[0][0];
    expect(args.data).not.toHaveProperty('originalFileName');
  });

  it('verifies the promoted destination before treating it as verified', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const original = storage.inspectObject.bind(storage);
    storage.inspectObject = async (key) =>
      key.includes('/verified/') ? null : original(key);
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(state.status).toBe('PENDING');
  });

  it('rejects with 409 when the staging object changes between inspect and read', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    storage.onInspectObject = () => {
      storage.putObject(STAGING_KEY, '%PDF-1.7 replaced', 'application/pdf');
    };
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(state.status).toBe('PENDING');
  });

  it('rejects with 409 when the staging object changes between read and copy', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    storage.onReadObjectPrefix = () => {
      storage.putObject(STAGING_KEY, '%PDF-1.7 replaced', 'application/pdf');
    };
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(state.status).toBe('PENDING');
  });

  it('rejects with 409 when the upload was superseded before the verified key was stored', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );
    storage.onReadObjectPrefix = () => {
      state.uploadStorageKey = 'organizations/org-1/documents/doc-1/newer';
    };

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(state.status).toBe('PENDING');
    expect(state.storageKey).toBeNull();
  });

  it('returns the current document when a concurrent completion already won', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );
    storage.onReadObjectPrefix = () => {
      state.status = 'PROCESSING';
    };

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(result.document.status).toBe('PROCESSING');
    expect(prisma.documentProcessingJob.create).not.toHaveBeenCalled();
  });

  it('maps a transient storage failure to 503 without changing state', async () => {
    const storage = new FakeObjectStorage();
    storage.inspectObject = async () => {
      throw new Error('storage exploded');
    };
    const { service, prisma, state } = createCompletionHarness(
      documentRecord(),
      storage,
    );

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(state.status).toBe('PENDING');
  });

  it('maps a version-mismatch error from the port to 409', async () => {
    const storage = new FakeObjectStorage();
    storage.inspectObject = async () => {
      throw new ObjectVersionMismatchError();
    };
    const { service } = createCompletionHarness(documentRecord(), storage);

    await expect(
      service.completeUpload(organizationContext(), 'doc-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not expose internal fields or a verified key in the response', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, state } = createCompletionHarness(documentRecord(), storage);

    const result = await service.completeUpload(
      organizationContext(),
      'doc-1',
      {},
    );

    expect(Object.keys(result.document).sort()).toEqual(PUBLIC_DOCUMENT_FIELDS);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain(state.storageKey ?? 'never-null');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('organizationId');
  });

  it('deletes the staging object after a successful promotion', async () => {
    const storage = new FakeObjectStorage();
    seedValidPdf(storage);
    const { service, state } = createCompletionHarness(documentRecord(), storage);
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await service.completeUpload(organizationContext(), 'doc-1', {});

    expect(state.status).toBe('PROCESSING');
    expect(deleteObject).toHaveBeenCalledWith(STAGING_KEY);
  });
});

describe('DocumentsService.reprocess', () => {
  const VERIFIED_KEY = 'organizations/org-1/documents/doc-1/verified/token';

  function failedRecord(): DocumentRecord {
    return documentRecord({
      status: 'FAILED',
      failureKind: 'PROCESSING',
      failureReason: 'NO_EXTRACTABLE_TEXT',
      uploadStorageKey: null,
      storageKey: VERIFIED_KEY,
      contentType: 'application/pdf',
      sizeBytes: 12,
      generation: 2,
    });
  }

  it('requeues a failed document and bumps its generation', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(VERIFIED_KEY, 'plain text', 'application/pdf');
    const { service, prisma } = createCompletionHarness(failedRecord(), storage);

    const result = await service.reprocess('org-1', 'doc-1');

    expect(result.document.status).toBe('PROCESSING');
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        organizationId: 'org-1',
        status: 'FAILED',
        storageKey: VERIFIED_KEY,
      },
      data: expect.objectContaining({
        status: 'PROCESSING',
        generation: { increment: 1 },
        failureKind: null,
        failureReason: null,
      }),
    });
    expect(prisma.documentProcessingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'doc-1',
        organizationId: 'org-1',
        documentGeneration: 3,
        verifiedStorageKey: VERIFIED_KEY,
        state: 'QUEUED',
        attempt: 0,
      }),
    });
  });

  it('returns 404 outside the organization', async () => {
    const { service, prisma } = createCompletionHarness();
    prisma.document.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.reprocess('org-2', 'doc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a document that is not failed', async () => {
    const { service } = createCompletionHarness(
      documentRecord({ status: 'READY', storageKey: VERIFIED_KEY }),
    );

    await expect(service.reprocess('org-1', 'doc-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a failed upload that never reached verified storage', async () => {
    const { service } = createCompletionHarness(
      documentRecord({
        status: 'FAILED',
        failureKind: 'VERIFICATION',
        uploadStorageKey: STAGING_KEY,
        storageKey: null,
      }),
    );

    await expect(service.reprocess('org-1', 'doc-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when the verified object is gone', async () => {
    const { service } = createCompletionHarness(failedRecord());

    await expect(service.reprocess('org-1', 'doc-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

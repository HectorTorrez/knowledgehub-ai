import type { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StorageConfig } from '../storage/storage.config.js';
import { FakeObjectStorage } from '../../test/support/fake-object-storage.js';
import { DocumentsService } from './documents.service.js';
import { MAX_UPLOAD_BYTES } from './upload-policy.js';

type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

interface DocumentRow {
  id: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    title: 'Quarterly report',
    status: 'PENDING',
    originalFileName: null,
    contentType: null,
    sizeBytes: null,
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

interface HarnessOptions {
  created?: DocumentRow;
  rows?: DocumentRow[];
  findFirst?: DocumentRow | null;
  uploadTtlSeconds?: number;
}

function storageConfig(uploadTtlSeconds = 900): StorageConfig {
  const config = {
    getOrThrow: (key: string) =>
      key === 'STORAGE_UPLOAD_TTL_SECONDS' ? uploadTtlSeconds : undefined,
  } as unknown as ConfigService;

  return new StorageConfig(config);
}

function createHarness(options: HarnessOptions = {}) {
  const prisma = {
    document: {
      create: vi.fn(
        async (_args: { data: Record<string, unknown> }) =>
          options.created ?? documentRow(),
      ),
      findMany: vi.fn(async () => options.rows ?? []),
      findFirst: vi.fn(
        async (_args: { where: unknown; select?: unknown }) =>
          options.findFirst === undefined ? documentRow() : options.findFirst,
      ),
      update: vi.fn(
        async (_args: { where: unknown; data: Record<string, unknown> }) =>
          options.created ?? documentRow(),
      ),
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

    expect(Object.keys(result.document).sort()).toEqual(
      [
        'contentType',
        'createdAt',
        'id',
        'originalFileName',
        'sizeBytes',
        'status',
        'title',
        'updatedAt',
      ].sort(),
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('failureReason');
    expect(serialized).not.toContain('organizationId');
  });
});

describe('DocumentsService.list', () => {
  it('scopes the query to the authorized organization with a deterministic order', async () => {
    const { service, prisma } = createHarness({ rows: [] });

    await service.list('org-1');

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: {
        id: true,
        title: true,
        status: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns an empty list for a newly created organization', async () => {
    const { service } = createHarness({ rows: [] });

    await expect(service.list('org-1')).resolves.toEqual({ documents: [] });
  });

  it('maps each row to the public summary shape', async () => {
    const { service } = createHarness({
      rows: [
        documentRow({ id: 'doc-2', title: 'Second' }),
        documentRow({ id: 'doc-1', title: 'First' }),
      ],
    });

    const result = await service.list('org-1');

    expect(result.documents).toEqual([
      {
        id: 'doc-2',
        title: 'Second',
        status: 'PENDING',
        originalFileName: null,
        contentType: null,
        sizeBytes: null,
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
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('preserves the deterministic database ordering', async () => {
    const { service } = createHarness({
      rows: [documentRow({ id: 'doc-b' }), documentRow({ id: 'doc-a' })],
    });

    const result = await service.list('org-1');

    expect(result.documents.map((document) => document.id)).toEqual([
      'doc-b',
      'doc-a',
    ]);
  });

  it('does not expose internal fields in the response', async () => {
    const { service } = createHarness({
      rows: [documentRow({ id: 'doc-1' })],
    });

    const result = await service.list('org-1');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('failureReason');
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

  it('returns the public summary shape when the document exists in the organization', async () => {
    const { service } = createHarness();

    const result = await service.getDetail('org-1', 'doc-1');

    expect(result).toEqual({
      document: {
        id: 'doc-1',
        title: 'Quarterly report',
        status: 'PENDING',
        originalFileName: null,
        contentType: null,
        sizeBytes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('returns 404 when the document does not exist in the organization', async () => {
    const { service } = createHarness({ findFirst: null });

    await expect(
      service.getDetail('org-1', 'doc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not expose internal fields in the response', async () => {
    const { service } = createHarness();

    const result = await service.getDetail('org-1', 'doc-1');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadStorageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('failureReason');
    expect(serialized).not.toContain('organizationId');
  });
});

describe('DocumentsService.createUploadUrl', () => {
  const input = { contentType: 'application/pdf' } as const;

  it('looks the document up within the authorized organization', async () => {
    const { service, prisma } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-1' },
      select: { id: true },
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
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the organization so cross-tenant ids are indistinguishable from missing ones', async () => {
    const { service, prisma } = createHarness({ findFirst: null });

    await expect(
      service.createUploadUrl(organizationContext(), 'doc-1', input),
    ).rejects.toBeInstanceOf(NotFoundException);

    const args = prisma.document.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'doc-1', organizationId: 'org-1' });
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
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('accepts a declared size exactly at the policy cap', async () => {
    const { service, storage } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', {
      ...input,
      sizeBytes: MAX_UPLOAD_BYTES,
    });

    expect(storage.calls).toHaveLength(1);
  });

  it('persists only the fresh staging key, leaving lifecycle and file metadata untouched', async () => {
    const { service, prisma, storage } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', {
      ...input,
      sizeBytes: 1024,
    });

    const key = storage.calls[0].key;
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { uploadStorageKey: key },
    });

    const args = prisma.document.update.mock.calls[0][0];
    expect(Object.keys(args.data)).toEqual(['uploadStorageKey']);
  });

  it('never writes the verified storage key when issuing an upload URL', async () => {
    const { service, prisma } = createHarness();

    await service.createUploadUrl(organizationContext(), 'doc-1', input);

    const args = prisma.document.update.mock.calls[0][0];
    expect(args.data).not.toHaveProperty('storageKey');
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
      prisma.document.update.mock.invocationCallOrder[0],
    );
  });

  it('does not return a response when persisting the key fails', async () => {
    const { service, prisma } = createHarness();
    prisma.document.update.mockRejectedValueOnce(new Error('write failed'));

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
});

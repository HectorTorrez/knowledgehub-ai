import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentsService } from './documents.service.js';

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
}

function createHarness(options: HarnessOptions = {}) {
  const prisma = {
    document: {
      create: vi.fn(
        async (_args: { data: Record<string, unknown> }) =>
          options.created ?? documentRow(),
      ),
      findMany: vi.fn(async () => options.rows ?? []),
      findFirst: vi.fn(async () =>
        options.findFirst === undefined ? documentRow() : options.findFirst,
      ),
    },
  };

  const service = new DocumentsService(prisma as unknown as PrismaService);

  return { service, prisma };
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
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('failureReason');
    expect(serialized).not.toContain('organizationId');
  });
});

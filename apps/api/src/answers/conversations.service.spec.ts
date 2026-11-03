import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import { encodeListCursor } from '../common/list-cursor.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  ConversationsService,
  type ConversationScope,
} from './conversations.service.js';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const CREATOR = { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace' };

const scope: ConversationScope = {
  organizationId: 'org-1',
  actor: { userId: 'user-1', canManageMembers: false },
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    title: 'Alpha',
    createdAt: CREATED_AT,
    visibility: 'PRIVATE',
    createdById: 'user-1',
    createdBy: CREATOR,
    ...overrides,
  };
}

function buildService(
  overrides: Partial<Record<'create' | 'findMany' | 'findFirst' | 'update' | 'deleteMany', (args?: unknown) => Promise<unknown>>> = {},
) {
  const conversation = {
    create: vi.fn(overrides.create ?? (async () => row())),
    findMany: vi.fn(overrides.findMany ?? (async () => [])),
    findFirst: vi.fn(overrides.findFirst ?? (async () => null)),
    update: vi.fn(overrides.update ?? (async () => row())),
    deleteMany: vi.fn(overrides.deleteMany ?? (async () => ({ count: 1 }))),
  };
  const prisma = {
    conversation,
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ conversation }),
    ),
  } as unknown as PrismaService;
  const activity = { record: vi.fn(async () => undefined) };

  return {
    service: new ConversationsService(
      prisma,
      activity as unknown as ActivityService,
    ),
    conversation,
    activity,
  };
}

describe('ConversationsService', () => {
  it('records the caller as the creator of a new private conversation', async () => {
    const { service, conversation } = buildService();

    const result = await service.create(scope);

    expect(conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: 'org-1', createdById: 'user-1' },
      }),
    );
    expect(result.conversation).toEqual({
      id: 'c1',
      title: 'Alpha',
      createdAt: '2026-01-01T00:00:00.000Z',
      visibility: 'PRIVATE',
      createdBy: CREATOR,
      canEdit: true,
      canShare: true,
    });
  });

  it('keeps the visibility filter when paginating with a cursor', async () => {
    const { service, conversation } = buildService();
    const cursor = encodeListCursor({ id: 'c9', createdAt: CREATED_AT });

    await service.list(scope, { limit: 25, scope: 'all', cursor });

    const where = conversation.findMany.mock.calls[0]?.[0] as {
      where: { organizationId: string; AND: unknown[]; OR?: unknown };
    };
    expect(where.where.organizationId).toBe('org-1');
    expect(where.where.OR).toBeUndefined();
    expect(where.where.AND).toContainEqual({
      OR: [{ createdById: 'user-1' }, { visibility: 'ORGANIZATION' }],
    });
    expect(where.where.AND).toHaveLength(3);
  });

  it('lists only the caller’s own conversations for the mine scope', async () => {
    const { service, conversation } = buildService();

    await service.list(scope, { limit: 25, scope: 'mine' });

    const call = conversation.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    expect(call.where.AND).toContainEqual({ createdById: 'user-1' });
  });

  it('marks a teammate’s shared conversation as read-only', async () => {
    const { service } = buildService({
      findFirst: async () =>
        row({ visibility: 'ORGANIZATION', createdById: 'user-2', createdBy: { ...CREATOR, id: 'user-2' } }),
    });

    const { conversation } = await service.getDetail(scope, 'c1');

    expect(conversation).toMatchObject({ canEdit: false, canShare: false });
  });

  it('returns 404 for a conversation the caller cannot read', async () => {
    const { service } = buildService({ findFirst: async () => null });

    await expect(service.getDetail(scope, 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('shares a conversation and records the activity', async () => {
    const { service, conversation, activity } = buildService({
      findFirst: async () => row(),
      update: async () => row({ visibility: 'ORGANIZATION' }),
    });

    const result = await service.setVisibility(scope, 'c1', 'ORGANIZATION');

    expect(conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { visibility: 'ORGANIZATION' } }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CONVERSATION_SHARED', targetId: 'c1' }),
    );
    expect(result.conversation.visibility).toBe('ORGANIZATION');
  });

  it('refuses to change the visibility of someone else’s conversation', async () => {
    const { service, conversation } = buildService({
      findFirst: async () =>
        row({ visibility: 'ORGANIZATION', createdById: 'user-2' }),
    });

    await expect(
      service.setVisibility(scope, 'c1', 'PRIVATE'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(conversation.update).not.toHaveBeenCalled();
  });

  it('deletes only conversations the caller manages', async () => {
    const { service, conversation } = buildService();

    await service.delete(scope, 'c1');

    expect(conversation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        organizationId: 'org-1',
        AND: [{ createdById: 'user-1' }],
      },
    });
  });

  it('lets a member manager delete legacy conversations', async () => {
    const { service, conversation } = buildService();

    await service.delete(
      { ...scope, actor: { userId: 'user-1', canManageMembers: true } },
      'c1',
    );

    expect(conversation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        organizationId: 'org-1',
        AND: [{ OR: [{ createdById: 'user-1' }, { createdById: null }] }],
      },
    });
  });

  it('returns 404 when nothing was deleted', async () => {
    const { service } = buildService({ deleteMany: async () => ({ count: 0 }) });

    await expect(service.delete(scope, 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { ActivityService, toActivityDto } from './activity.service.js';

describe('ActivityService', () => {
  it('writes the entry using the supplied transaction client', async () => {
    const create = vi.fn().mockResolvedValue({});
    const client = { organizationActivity: { create } } as unknown as Prisma.TransactionClient;
    const entry = {
      organizationId: 'org', actorId: 'actor', action: 'MEMBER_ADDED' as const,
      targetType: 'member', targetId: 'member', metadata: { role: 'MEMBER' },
    };
    await new ActivityService().record(client, entry);
    expect(create).toHaveBeenCalledWith({ data: entry });
  });
});

describe('toActivityDto', () => {
  it('maps public actor fields and string metadata', () => {
    const row = {
      id: 'event', organizationId: 'org', actorId: 'actor', action: 'MEMBER_ADDED' as const,
      actor: { id: 'actor', firstName: 'A', lastName: 'B', email: 'a@example.com' },
      targetType: 'member', targetId: 'member', metadata: { role: 'MEMBER', count: 1 },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(toActivityDto(row)).toEqual({
      id: 'event', action: 'MEMBER_ADDED', actor: row.actor, targetType: 'member',
      targetId: 'member', metadata: { role: 'MEMBER' }, createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

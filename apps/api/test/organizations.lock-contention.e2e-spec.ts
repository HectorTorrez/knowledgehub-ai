import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { OrganizationContext } from '../src/organizations/organization-context.js';
import { OrganizationsService } from '../src/organizations/organizations.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const envPath = new URL('../.env', import.meta.url);
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const connectionString = process.env.DATABASE_URL!;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function expectTransientRejection(
  run: () => Promise<unknown>,
): Promise<void> {
  const startedAt = Date.now();
  const error = await run().catch((caught: unknown) => caught);
  const elapsed = Date.now() - startedAt;

  expect(error).toBeInstanceOf(ServiceUnavailableException);
  expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  expect(elapsed).toBeGreaterThanOrEqual(700);
  expect(elapsed).toBeLessThan(3000);
}

describe('organization membership lock contention (e2e)', () => {
  let prisma: PrismaClient;
  let service: OrganizationsService;
  let organizationId: string;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let outsiderEmail: string;
  let context: OrganizationContext;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    service = new OrganizationsService(prisma as unknown as PrismaService);

    const suffix = randomUUID();
    const owner = await prisma.user.create({
      data: {
        email: `lock-owner-${suffix}@example.test`,
        passwordHash: 'x',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });
    const member = await prisma.user.create({
      data: {
        email: `lock-member-${suffix}@example.test`,
        passwordHash: 'x',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `lock-outsider-${suffix}@example.test`,
        passwordHash: 'x',
        firstName: 'Alan',
        lastName: 'Turing',
      },
    });
    const organization = await prisma.organization.create({
      data: { name: 'Lock Contention Org' },
    });

    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    outsiderEmail = outsider.email;
    organizationId = organization.id;

    await prisma.membership.create({
      data: { userId: ownerId, organizationId, role: 'OWNER' },
    });
    await prisma.membership.create({
      data: { userId: memberId, organizationId, role: 'MEMBER' },
    });

    context = {
      organizationId,
      userId: ownerId,
      role: 'OWNER',
      organization: {
        id: organization.id,
        name: organization.name,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      },
    };
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId] } },
    });
    await prisma.$disconnect();
  });

  it('bounds every blocked membership mutation to a 503 with no change and no leaked lock_timeout', async () => {
    const locked = deferred();
    const release = deferred();

    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });

    await locked.promise;

    try {
      await expectTransientRejection(() =>
        service.addMember(context, { email: outsiderEmail }),
      );
      await expectTransientRejection(() =>
        service.updateMemberRole(context, memberId, { role: 'OWNER' }),
      );
      await expectTransientRejection(() =>
        service.removeMember(context, memberId),
      );
    } finally {
      release.resolve();
      await holder.catch(() => undefined);
    }

    expect(
      await prisma.membership.count({
        where: { userId: memberId, organizationId },
      }),
    ).toBe(1);
    expect(
      await prisma.membership.count({
        where: { userId: outsiderId, organizationId },
      }),
    ).toBe(0);

    await expect(
      service.removeMember(context, memberId),
    ).resolves.toBeUndefined();
    expect(
      await prisma.membership.count({
        where: { userId: memberId, organizationId },
      }),
    ).toBe(0);

    const [timeoutRow] = await prisma.$queryRaw<
      { lock_timeout: string }[]
    >`SHOW lock_timeout`;
    expect(timeoutRow.lock_timeout).toBe('0');
  }, 15000);
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct horse battery staple';

function validBody() {
  return {
    email: `org-${randomUUID()}@example.test`,
    password: PASSWORD,
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
}

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] ?? []) as unknown as string[];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return cookie.slice(name.length + 1).split(';')[0];
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

describe('organizations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();

  const registerUser = async (): Promise<{
    email: string;
    userId: string;
    token: string;
  }> => {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return {
      email: body.email,
      userId: response.body.user.id as string,
      token: cookieValue(setCookies(response), ACCESS_TOKEN_COOKIE),
    };
  };

  const createOrganization = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/organizations')
      .set(bearer(token))
      .send(body);

  const listOrganizations = (token: string) =>
    request(app.getHttpServer()).get('/organizations').set(bearer(token));

  const getOrganizationDetail = (token: string, organizationId: string) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}`)
      .set(bearer(token));

  const listMembers = (token: string, organizationId: string) =>
    request(app.getHttpServer())
      .get(`/organizations/${organizationId}/members`)
      .set(bearer(token));

  const addMembership = (
    userId: string,
    organizationId: string,
    role: 'OWNER' | 'MEMBER',
  ) => prisma.membership.create({ data: { userId, organizationId, role } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (trackedOrganizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...trackedOrganizationIds] } },
      });
    }
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Acme Inc.' })
      .expect(401);

    await request(app.getHttpServer()).get('/organizations').expect(401);
  });

  it('creates an organization and returns the OWNER detail response', async () => {
    const { userId, token } = await registerUser();

    const response = await createOrganization(token, {
      name: 'Acme Inc.',
    }).expect(201);

    expect(response.body).toEqual({
      organization: {
        id: expect.any(String),
        name: 'Acme Inc.',
        role: 'OWNER',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    // Timestamps are ISO 8601 and parse back losslessly.
    const { createdAt, updatedAt } = response.body.organization;
    expect(new Date(createdAt).toISOString()).toBe(createdAt);
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);

    // No persistence-only fields leak into the response.
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('memberships');

    const organizationId = response.body.organization.id as string;
    trackedOrganizationIds.add(organizationId);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(organization.name).toBe('Acme Inc.');

    const membership = await prisma.membership.findFirstOrThrow({
      where: { organizationId },
    });
    expect(membership.role).toBe('OWNER');
    expect(membership.userId).toBe(userId);
  });

  it('trims surrounding whitespace from the organization name', async () => {
    const { token } = await registerUser();

    const response = await createOrganization(token, {
      name: '  Acme Inc.  ',
    }).expect(201);

    trackedOrganizationIds.add(response.body.organization.id as string);
    expect(response.body.organization.name).toBe('Acme Inc.');
  });

  it('lists the organizations created by the authenticated user', async () => {
    const { token } = await registerUser();

    const created = await createOrganization(token, {
      name: 'Listed Org',
    }).expect(201);
    const organizationId = created.body.organization.id as string;
    trackedOrganizationIds.add(organizationId);

    const response = await listOrganizations(token).expect(200);
    expect(response.body).toEqual({
      organizations: [
        {
          id: organizationId,
          name: 'Listed Org',
          role: 'OWNER',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it('returns an empty list for a newly registered user with no memberships', async () => {
    const { token } = await registerUser();

    const response = await listOrganizations(token).expect(200);
    expect(response.body).toEqual({ organizations: [] });
  });

  it('returns only the organizations the user belongs to', async () => {
    const userA = await registerUser();
    const userB = await registerUser();

    const aOne = await createOrganization(userA.token, {
      name: 'A One',
    }).expect(201);
    const aTwo = await createOrganization(userA.token, {
      name: 'A Two',
    }).expect(201);
    const bOne = await createOrganization(userB.token, {
      name: 'B One',
    }).expect(201);

    const ids = [
      aOne.body.organization.id as string,
      aTwo.body.organization.id as string,
      bOne.body.organization.id as string,
    ];
    for (const id of ids) {
      trackedOrganizationIds.add(id);
    }

    const listA = await listOrganizations(userA.token).expect(200);
    const listB = await listOrganizations(userB.token).expect(200);

    const idsOf = (body: { organizations: { id: string }[] }) =>
      body.organizations.map((organization) => organization.id);

    expect(new Set(idsOf(listA.body))).toEqual(new Set([ids[0], ids[1]]));
    expect(idsOf(listB.body)).toEqual([ids[2]]);

    // Every listed organization carries the requesting user's own role.
    expect(
      listA.body.organizations.every(
        (organization: { role: string }) => organization.role === 'OWNER',
      ),
    ).toBe(true);
  });

  it('orders organizations deterministically by creation time then id', async () => {
    const { userId, token } = await registerUser();

    const names = ['First', 'Second', 'Third'];
    for (const name of names) {
      const created = await createOrganization(token, { name }).expect(201);
      trackedOrganizationIds.add(created.body.organization.id as string);
    }

    const response = await listOrganizations(token).expect(200);
    const actualIds = response.body.organizations.map(
      (organization: { id: string }) => organization.id,
    );

    const expected = await prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    expect(actualIds).toEqual(expected.map((organization) => organization.id));
  });

  it('rejects invalid names with 400', async () => {
    const { token } = await registerUser();

    const cases: object[] = [
      { name: '' },
      { name: '   ' },
      { name: 'a'.repeat(101) },
      { name: 123 },
      { name: ['Acme'] },
      {},
      { name: null },
    ];

    for (const body of cases) {
      await createOrganization(token, body).expect(400);
    }
  });

  it('rejects unexpected request properties', async () => {
    const { token } = await registerUser();

    await createOrganization(token, {
      name: 'Acme Inc.',
      role: 'OWNER',
    }).expect(400);

    await createOrganization(token, {
      name: 'Acme Inc.',
      userId: 'someone-else',
    }).expect(400);
  });

  it('keeps rejecting requests whose session has been revoked', async () => {
    const { userId, token } = await registerUser();

    await listOrganizations(token).expect(200);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await listOrganizations(token).expect(401);
    await createOrganization(token, { name: 'Acme Inc.' }).expect(401);
  });

  describe('organization detail', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const organizationId = randomUUID();

      await request(app.getHttpServer())
        .get(`/organizations/${organizationId}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/organizations/${organizationId}/members`)
        .expect(401);
    });

    it('returns 200 with the requesting OWNER role for a member', async () => {
      const { userId, token } = await registerUser();
      const created = await createOrganization(token, {
        name: 'Detail Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      const response = await getOrganizationDetail(
        token,
        organizationId,
      ).expect(200);

      expect(response.body).toEqual({
        organization: {
          id: organizationId,
          name: 'Detail Org',
          role: 'OWNER',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      // The role is the persisted membership role, not anything client-provided.
      const membership = await prisma.membership.findFirstOrThrow({
        where: { organizationId, userId },
      });
      expect(response.body.organization.role).toBe(membership.role);
    });

    it('returns 200 with the requesting MEMBER role for a non-owner member', async () => {
      const owner = await registerUser();
      const member = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Shared Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      await addMembership(member.userId, organizationId, 'MEMBER');

      const response = await getOrganizationDetail(
        member.token,
        organizationId,
      ).expect(200);

      expect(response.body.organization.role).toBe('MEMBER');
      expect(response.body.organization.id).toBe(organizationId);
    });

    it('returns 403 for an authenticated non-member', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Private Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      await getOrganizationDetail(outsider.token, organizationId).expect(403);
      await listMembers(outsider.token, organizationId).expect(403);
    });

    it('returns 400 for a malformed organization id', async () => {
      const { token } = await registerUser();

      for (const malformed of ['not-a-uuid', '123', 'null']) {
        await getOrganizationDetail(token, malformed).expect(400);
        await listMembers(token, malformed).expect(400);
      }
    });

    it('does not accept an organization id from the query string', async () => {
      const owner = await registerUser();
      const other = await registerUser();

      const ownOrg = await createOrganization(owner.token, {
        name: 'Own Org',
      }).expect(201);
      const ownOrganizationId = ownOrg.body.organization.id as string;
      trackedOrganizationIds.add(ownOrganizationId);

      const otherOrg = await createOrganization(other.token, {
        name: 'Other Org',
      }).expect(201);
      const otherOrganizationId = otherOrg.body.organization.id as string;
      trackedOrganizationIds.add(otherOrganizationId);

      // The route parameter is authoritative; a conflicting query parameter is
      // ignored, so the caller still gets their own organization.
      const response = await request(app.getHttpServer())
        .get(`/organizations/${ownOrganizationId}?organizationId=${otherOrganizationId}`)
        .set(bearer(owner.token))
        .expect(200);

      expect(response.body.organization.id).toBe(ownOrganizationId);
    });

    it('stops serving a membership once it is revoked', async () => {
      const owner = await registerUser();
      const member = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Revocation Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      await addMembership(member.userId, organizationId, 'MEMBER');
      await getOrganizationDetail(member.token, organizationId).expect(200);

      // Revoke directly through Prisma, as the existing setup can.
      await prisma.membership.deleteMany({
        where: { userId: member.userId, organizationId },
      });

      await getOrganizationDetail(member.token, organizationId).expect(403);
      await listMembers(member.token, organizationId).expect(403);
    });
  });

  describe('member listing', () => {
    it('returns the members for both an OWNER and a MEMBER, ordered deterministically', async () => {
      const owner = await registerUser();
      const member = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Team Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      await addMembership(member.userId, organizationId, 'MEMBER');

      const expected = await prisma.membership.findMany({
        where: { organizationId },
        select: {
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      });

      const expectedBody = {
        members: expected.map((entry) => ({
          userId: entry.user.id,
          email: entry.user.email,
          firstName: entry.user.firstName,
          lastName: entry.user.lastName,
          role: entry.role,
          createdAt: entry.createdAt.toISOString(),
        })),
      };

      for (const token of [owner.token, member.token]) {
        const response = await listMembers(token, organizationId).expect(200);
        expect(response.body).toEqual(expectedBody);
      }
    });

    it('does not list members of another organization', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Isolated Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      await listMembers(outsider.token, organizationId).expect(403);
    });

    it('exposes only approved public member fields', async () => {
      const owner = await registerUser();

      const created = await createOrganization(owner.token, {
        name: 'Fields Org',
      }).expect(201);
      const organizationId = created.body.organization.id as string;
      trackedOrganizationIds.add(organizationId);

      const response = await listMembers(owner.token, organizationId).expect(200);

      const [first] = response.body.members;
      expect(Object.keys(first).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'lastName',
          'role',
          'userId',
        ].sort(),
      );

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('sessionId');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('organizationId');
    });
  });
});

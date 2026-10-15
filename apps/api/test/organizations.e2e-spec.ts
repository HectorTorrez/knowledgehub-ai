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
});

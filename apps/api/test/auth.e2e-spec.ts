import { createHash, randomUUID } from 'node:crypto';
import {
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { CSRF_COOKIE } from '../src/auth/csrf.js';
import { PasswordService } from '../src/auth/password.service.js';
import { SessionGuard } from '../src/auth/session.guard.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'correct horse battery staple';

function validBody() {
  return {
    email: `user-${randomUUID()}@example.test`,
    password: PASSWORD,
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
}

function findCookie(cookies: string[], name: string): string | undefined {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

function requireCookie(cookies: string[], name: string): string {
  const cookie = findCookie(cookies, name);
  if (!cookie) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return cookie;
}

function cookieValue(cookies: string[], name: string): string {
  return requireCookie(cookies, name).slice(name.length + 1).split(';')[0];
}

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] ?? []) as unknown as string[];
}

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  const trackedEmails = new Set<string>();

  const register = (body: object) =>
    request(app.getHttpServer()).post('/auth/register').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('creates the account, returns 201, sets cookies and persists only hashes', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await register(body)
      .set('User-Agent', 'kh-test-agent')
      .expect(201);

    const cookies = setCookies(response);
    const access = requireCookie(cookies, ACCESS_TOKEN_COOKIE);
    const refresh = requireCookie(cookies, REFRESH_TOKEN_COOKIE);

    // Cookie separation: access is broad, refresh is scoped to /auth.
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(/Max-Age=\d+/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/auth/i);

    // Response exposes only the public profile, never tokens or hashes.
    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        email: body.email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toContain('passwordHash');
    expect(bodyText).not.toContain(cookieValue(cookies, ACCESS_TOKEN_COOKIE));
    expect(bodyText).not.toContain(cookieValue(cookies, REFRESH_TOKEN_COOKIE));

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe(body.password);
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true);
    await expect(
      passwords.verify(user!.passwordHash, body.password),
    ).resolves.toBe(true);

    const sessions = await prisma.authSession.findMany({
      where: { userId: user!.id },
      include: { refreshTokens: true },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userAgent).toBe('kh-test-agent');
    expect(sessions[0].revokedAt).toBeNull();

    expect(sessions[0].refreshTokens).toHaveLength(1);
    const rawRefresh = cookieValue(cookies, REFRESH_TOKEN_COOKIE);
    const storedHash = sessions[0].refreshTokens[0].tokenHash;
    expect(storedHash).toBe(
      createHash('sha256').update(rawRefresh).digest('hex'),
    );
    expect(storedHash).not.toBe(rawRefresh);
  });

  it('issues a JavaScript-readable CSRF cookie when browser authentication is enabled', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await register(body).expect(201);
    const cookies = setCookies(response);

    const csrf = requireCookie(cookies, CSRF_COOKIE);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(csrf).toMatch(/SameSite=Lax/i);
    expect(csrf).toMatch(/Path=\//i);
    expect(cookieValue(cookies, CSRF_COOKIE)).toMatch(
      /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    );
  });

  it('normalizes the email and rejects a differently-cased duplicate', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await register({
      ...body,
      email: `  ${body.email.toUpperCase()}  `,
    }).expect(201);
    expect(response.body.user.email).toBe(body.email);

    await register({ ...body, email: body.email.toUpperCase() }).expect(409);
  });

  it('rejects invalid input with 400', async () => {
    const missingField = validBody() as Record<string, unknown>;
    delete missingField.lastName;

    const cases: object[] = [
      { ...validBody(), email: 'not-an-email' },
      { ...validBody(), password: 'short' },
      { ...validBody(), password: 123456789012 },
      { ...validBody(), firstName: '' },
      { ...validBody(), lastName: '   ' },
      { ...validBody(), firstName: 'a'.repeat(101) },
      { ...validBody(), isAdmin: true },
      missingField,
    ];

    for (const body of cases) {
      await register(body).expect(400);
    }
  });

  it('enforces the password length policy', async () => {
    await register({ ...validBody(), password: 'a'.repeat(11) }).expect(400);
    await register({ ...validBody(), password: 'a'.repeat(129) }).expect(400);

    const body = validBody();
    trackedEmails.add(body.email);
    await register({ ...body, password: 'a'.repeat(12) }).expect(201);
  });

  it('hashes the password exactly as supplied, including whitespace', async () => {
    const body = validBody();
    const password = '  spaced passphrase  ';
    trackedEmails.add(body.email);

    await register({ ...body, password }).expect(201);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });
    await expect(passwords.verify(user!.passwordHash, password)).resolves.toBe(
      true,
    );
    await expect(
      passwords.verify(user!.passwordHash, password.trim()),
    ).resolves.toBe(false);
  });

  it('returns 409 for an already-registered email', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    await register(body).expect(201);
    const duplicate = await register(body).expect(409);
    expect(typeof duplicate.body.message).toBe('string');
  });

  it('lets exactly one of several concurrent registrations win', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => register(body)),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(4);
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
  });

  it('guard accepts a live session and rejects revoked or expired sessions', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await register(body).expect(201);
    const token = cookieValue(setCookies(response), ACCESS_TOKEN_COOKIE);
    const userId = response.body.user.id as string;

    const guard = app.get(SessionGuard);
    const makeContext = (): ExecutionContext =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            cookies: { [ACCESS_TOKEN_COOKIE]: token },
            headers: {},
          }),
        }),
      }) as unknown as ExecutionContext;

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });

    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: null, expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('POST /auth/register transaction rollback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerEmail: string;
  const trackedEmails = new Set<string>();
  const collidingHash = randomUUID();

  beforeAll(async () => {
    // Force the refresh-token insert to violate its unique constraint, so the
    // transaction fails after the user row is created.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TokenService)
      .useValue({
        signAccessToken: async () => 'unused',
        verifyAccessToken: async () => {
          throw new Error('unused');
        },
        generateRefreshToken: () => ({
          token: 'unused',
          hash: collidingHash,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        hashRefreshToken: () => collidingHash,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    // Seed a token that already owns the colliding hash.
    ownerEmail = `owner-${randomUUID()}@example.test`;
    trackedEmails.add(ownerEmail);
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash: 'seed',
        firstName: 'Owner',
        lastName: 'Owner',
      },
    });
    const ownerSession = await prisma.authSession.create({
      data: { userId: owner.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.refreshToken.create({
      data: {
        sessionId: ownerSession.id,
        tokenHash: collidingHash,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [...trackedEmails] } },
    });
    await app.close();
  });

  it('leaves no partial account and does not misreport an unrelated unique violation as 409', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body);

    expect(response.status).toBe(500);
    expect(response.status).not.toBe(409);

    // The user was rolled back with its session/token; the seeded owner remains.
    expect(
      await prisma.user.findUnique({ where: { email: body.email } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { email: ownerEmail } }),
    ).not.toBeNull();
  });
});

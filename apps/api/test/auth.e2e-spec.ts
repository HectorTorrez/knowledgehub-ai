import { createHash, randomUUID } from 'node:crypto';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { CSRF_COOKIE, CSRF_HEADER, generateCsrfToken } from '../src/auth/csrf.js';
import { PasswordService } from '../src/auth/password.service.js';
import { SessionGuard } from '../src/auth/session.guard.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Controller('__test/protected')
class TestProtectedController {
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  handle(): { ok: true } {
    return { ok: true };
  }
}

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

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(/Max-Age=\d+/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/auth/i);

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

  it('accepts a registration that carries stale auth cookies without a CSRF token', async () => {
    const body = validBody();
    trackedEmails.add(body.email);

    const response = await register(body)
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=stale-access-token`])
      .expect(201);

    expect(response.body.user.email).toBe(body.email);
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

    expect(
      await prisma.user.findUnique({ where: { email: body.email } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { email: ownerEmail } }),
    ).not.toBeNull();
  });
});

describe('CSRF enforcement over HTTP (e2e)', () => {
  const userId = 'user-http-1';
  const sessionId = 'session-http-1';

  let app: INestApplication;
  let accessToken: string;
  let csrfToken: string;
  let trustedOrigin: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [TestProtectedController],
    })
      .overrideProvider(PrismaService)
      .useValue({
        authSession: {
          findUnique: async () => ({
            id: sessionId,
            userId,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        onModuleDestroy: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    accessToken = await app
      .get(TokenService)
      .signAccessToken(userId, sessionId);
    csrfToken = generateCsrfToken(app.get(AuthConfig).csrfSecret);
    trustedOrigin = app.get(AuthConfig).trustedOrigins[0];
  });

  afterAll(async () => {
    await app.close();
  });

  const post = () => request(app.getHttpServer()).post('/__test/protected');

  it('rejects a cookie-authenticated unsafe request without a CSRF token', async () => {
    await post()
      .set('Origin', trustedOrigin)
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=${accessToken}`])
      .expect(403);
  });

  it('rejects a cookie-authenticated unsafe request with an untrusted origin', async () => {
    await post()
      .set('Origin', 'http://evil.test')
      .set(CSRF_HEADER, csrfToken)
      .set('Cookie', [
        `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
        `${CSRF_COOKIE}=${csrfToken}`,
      ])
      .expect(403);
  });

  it('reaches the handler for a cookie-authenticated request with a valid token and trusted origin', async () => {
    const response = await post()
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, csrfToken)
      .set('Cookie', [
        `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
        `${CSRF_COOKIE}=${csrfToken}`,
      ])
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it('rejects a cookie-authenticated request when an empty bearer credential tries to bypass CSRF', async () => {
    await post()
      .set('Authorization', 'Bearer ')
      .set('Origin', 'http://evil.test')
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=${accessToken}`])
      .expect(403);
  });

  it('keeps the CSRF exemption for a valid bearer credential', async () => {
    const response = await post()
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Origin', 'http://evil.test')
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=${accessToken}`])
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it('still requires CSRF for an empty bearer credential with a trusted origin', async () => {
    await post()
      .set('Authorization', 'Bearer ')
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=${accessToken}`])
      .set('Origin', trustedOrigin)
      .expect(403);
  });
});

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authConfig: AuthConfig;
  const trackedEmails = new Set<string>();

  const login = (body: object) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  async function createUser(): Promise<string> {
    const body = validBody();
    trackedEmails.add(body.email);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);
    return body.email;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    authConfig = app.get(AuthConfig);
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('returns 200 with the public user, cookies and no raw credentials', async () => {
    const email = await createUser();

    const response = await login({ email, password: PASSWORD })
      .set('User-Agent', 'kh-login-agent')
      .expect(200);

    const cookies = setCookies(response);
    const access = requireCookie(cookies, ACCESS_TOKEN_COOKIE);
    const refresh = requireCookie(cookies, REFRESH_TOKEN_COOKIE);

    const accessMaxAgeSeconds = authConfig.accessTtlMs / 1000;
    const sessionMaxAgeSeconds = authConfig.sessionTtlMs / 1000;
    expect(accessMaxAgeSeconds).toBe(900);
    expect(refresh).toBeDefined();

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(new RegExp(`Max-Age=${accessMaxAgeSeconds}\\b`, 'i'));
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/auth/i);
    expect(refresh).toMatch(
      new RegExp(`Max-Age=${sessionMaxAgeSeconds}\\b`, 'i'),
    );

    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        email,
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

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const sessions = await prisma.authSession.findMany({
      where: { userId: user.id },
      include: { refreshTokens: true },
    });
    const loginSession = sessions.find(
      (session) => session.userAgent === 'kh-login-agent',
    );
    expect(loginSession).toBeDefined();
    expect(loginSession!.revokedAt).toBeNull();
    expect(loginSession!.refreshTokens).toHaveLength(1);

    const expiresAt = loginSession!.expiresAt.getTime();
    expect(expiresAt).toBeGreaterThan(
      Date.now() + authConfig.sessionTtlMs - 60_000,
    );
    expect(expiresAt).toBeLessThanOrEqual(
      Date.now() + authConfig.sessionTtlMs + 60_000,
    );

    const storedHash = loginSession!.refreshTokens[0].tokenHash;
    const rawRefresh = cookieValue(cookies, REFRESH_TOKEN_COOKIE);
    expect(storedHash).toBe(createHash('sha256').update(rawRefresh).digest('hex'));
    expect(storedHash).not.toBe(rawRefresh);
  });

  it('issues a JavaScript-readable CSRF cookie when browser authentication is enabled', async () => {
    const email = await createUser();

    const response = await login({ email, password: PASSWORD }).expect(200);
    const cookies = setCookies(response);

    const csrf = requireCookie(cookies, CSRF_COOKIE);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(csrf).toMatch(/SameSite=Lax/i);
    expect(csrf).toMatch(/Path=\//i);
    expect(cookieValue(cookies, CSRF_COOKIE)).toMatch(
      /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    );
  });

  it('accepts a login that carries stale auth cookies without a CSRF token', async () => {
    const email = await createUser();

    const response = await login({ email, password: PASSWORD })
      .set('Cookie', [`${ACCESS_TOKEN_COOKIE}=stale-access-token`])
      .expect(200);

    expect(response.body.user.email).toBe(email);
  });

  it('looks up the email case-insensitively and with surrounding whitespace normalized', async () => {
    const email = await createUser();

    const response = await login({
      email: `  ${email.toUpperCase()}  `,
      password: PASSWORD,
    }).expect(200);

    expect(response.body.user.email).toBe(email);
  });

  it('creates a separate session for each successful login', async () => {
    const email = await createUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const sessionsBefore = await prisma.authSession.count({
      where: { userId: user.id },
    });

    await login({ email, password: PASSWORD }).expect(200);
    await login({ email, password: PASSWORD }).expect(200);

    const sessions = await prisma.authSession.findMany({
      where: { userId: user.id },
      include: { refreshTokens: true },
    });
    expect(sessions).toHaveLength(sessionsBefore + 2);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(
      sessions.length,
    );
    for (const session of sessions) {
      expect(session.refreshTokens).toHaveLength(1);
    }
  });

  it('returns an identical generic 401 for an unknown email and an incorrect password', async () => {
    const email = await createUser();

    const unknownEmail = await login({
      email: `nobody-${randomUUID()}@example.test`,
      password: PASSWORD,
    }).expect(401);
    const wrongPassword = await login({
      email,
      password: 'definitely-not-the-password',
    }).expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.body.message).toBe('Invalid email or password');
  });

  it('performs a dummy password verification for an unknown email', async () => {
    const passwords = app.get(PasswordService);
    const verify = vi.spyOn(passwords, 'verify');

    await login({
      email: `nobody-${randomUUID()}@example.test`,
      password: PASSWORD,
    }).expect(401);

    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });

  it('does not create a session or refresh token on authentication failure', async () => {
    const email = await createUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const countRefreshTokens = () =>
      prisma.refreshToken.count({ where: { session: { userId: user.id } } });

    const sessionsBefore = await prisma.authSession.count({
      where: { userId: user.id },
    });
    const tokensBefore = await countRefreshTokens();

    await login({ email, password: 'wrong-password' }).expect(401);
    await login({
      email: `nobody-${randomUUID()}@example.test`,
      password: PASSWORD,
    }).expect(401);

    expect(
      await prisma.authSession.count({ where: { userId: user.id } }),
    ).toBe(sessionsBefore);
    expect(await countRefreshTokens()).toBe(tokensBefore);
  });

  it('rejects invalid input with 400', async () => {
    const cases: object[] = [
      { password: PASSWORD },
      { email: 'user@example.com' },
      { email: 'not-an-email', password: PASSWORD },
      { email: 'user@example.com', password: '' },
      { email: 'user@example.com', password: 'a'.repeat(129) },
      { email: 'user@example.com', password: 12345678 },
      { email: 'user@example.com', password: PASSWORD, isAdmin: true },
    ];

    for (const body of cases) {
      await login(body).expect(400);
    }
  });
});

describe('POST /auth/login transaction rollback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userEmail: string;
  const trackedEmails = new Set<string>();
  const collidingHash = randomUUID();

  beforeAll(async () => {
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
    const passwords = app.get(PasswordService);

    userEmail = `login-${randomUUID()}@example.test`;
    trackedEmails.add(userEmail);
    await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: await passwords.hash(PASSWORD),
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });

    const ownerEmail = `owner-login-${randomUUID()}@example.test`;
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

  it('leaves no session behind when the refresh token cannot be persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: PASSWORD });

    expect(response.status).toBe(500);
    expect(response.status).not.toBe(401);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: userEmail },
    });
    expect(
      await prisma.authSession.findMany({ where: { userId: user.id } }),
    ).toHaveLength(0);
    expect(
      await prisma.refreshToken.count({ where: { tokenHash: collidingHash } }),
    ).toBe(1);
  });
});

type CookieJar = Record<string, string>;

function optionalCookieValue(cookies: string[], name: string): string {
  const cookie = findCookie(cookies, name);
  return cookie ? cookie.slice(name.length + 1).split(';')[0] : '';
}

function readSetCookies(response: request.Response): CookieJar {
  const cookies = setCookies(response);
  return {
    [ACCESS_TOKEN_COOKIE]: optionalCookieValue(cookies, ACCESS_TOKEN_COOKIE),
    [REFRESH_TOKEN_COOKIE]: optionalCookieValue(cookies, REFRESH_TOKEN_COOKIE),
    [CSRF_COOKIE]: optionalCookieValue(cookies, CSRF_COOKIE),
  };
}

function cookieHeader(jar: CookieJar): string[] {
  return Object.entries(jar)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${name}=${value}`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('POST /auth/refresh and /auth/logout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authConfig: AuthConfig;
  let trustedOrigin: string;
  const trackedEmails = new Set<string>();

  async function registerUser(
    userAgent = 'refresh-agent',
  ): Promise<{ email: string; userId: string; jar: CookieJar }> {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('User-Agent', userAgent)
      .send(body)
      .expect(201);

    return {
      email: body.email,
      userId: response.body.user.id as string,
      jar: readSetCookies(response),
    };
  }

  const refreshWith = (jar: CookieJar) =>
    request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, jar[CSRF_COOKIE] ?? '')
      .set('Cookie', cookieHeader(jar));

  const logoutWith = (jar: CookieJar) =>
    request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, jar[CSRF_COOKIE] ?? '')
      .set('Cookie', cookieHeader(jar));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [TestProtectedController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    authConfig = app.get(AuthConfig);
    trustedOrigin = authConfig.trustedOrigins[0];
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('rotates the refresh token, replaces cookies and returns only the user', async () => {
    const { email, userId, jar } = await registerUser();
    const originalRefresh = jar[REFRESH_TOKEN_COOKIE];

    const response = await refreshWith(jar).expect(200);

    const rotated = readSetCookies(response);
    expect(response.body).toEqual({
      user: {
        id: userId,
        email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(rotated[REFRESH_TOKEN_COOKIE]).not.toBe(originalRefresh);
    expect(rotated[REFRESH_TOKEN_COOKIE].length).toBeGreaterThan(0);
    expect(rotated[ACCESS_TOKEN_COOKIE].length).toBeGreaterThan(0);
    expect(rotated[CSRF_COOKIE]).toMatch(
      /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/,
    );

    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toContain(originalRefresh);
    expect(bodyText).not.toContain(rotated[REFRESH_TOKEN_COOKIE]);
    expect(bodyText).not.toContain(rotated[ACCESS_TOKEN_COOKIE]);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });
    expect(session.revokedAt).toBeNull();
    expect(session.lastUsedAt).not.toBeNull();
    expect(session.refreshTokens).toHaveLength(2);

    const consumed = session.refreshTokens.find(
      (token) => token.tokenHash === sha256(originalRefresh),
    );
    expect(consumed?.usedAt).not.toBeNull();

    const successor = session.refreshTokens.find(
      (token) => token.tokenHash === sha256(rotated[REFRESH_TOKEN_COOKIE]),
    );
    expect(successor).toBeDefined();
    expect(successor!.usedAt).toBeNull();
    expect(successor!.expiresAt.getTime()).toBeLessThanOrEqual(
      session.expiresAt.getTime(),
    );

    const refreshCookie = requireCookie(
      setCookies(response),
      REFRESH_TOKEN_COOKIE,
    );
    const maxAge = Number(/Max-Age=(\d+)/i.exec(refreshCookie)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(authConfig.sessionTtlMs / 1000);
  });

  it('rejects an unknown refresh token without revoking the session', async () => {
    const { userId, jar } = await registerUser();
    const unknown: CookieJar = {
      ...jar,
      [REFRESH_TOKEN_COOKIE]: randomUUID(),
    };

    await refreshWith(unknown).expect(401);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });
    expect(session.revokedAt).toBeNull();
    expect(session.refreshTokens).toHaveLength(1);
    expect(session.refreshTokens[0].usedAt).toBeNull();
  });

  it('rejects a missing refresh token with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', trustedOrigin)
      .expect(401);
  });

  it('rejects an expired refresh token without revoking the session', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.refreshToken.updateMany({
      where: { sessionId: session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await refreshWith(jar).expect(401);

    const after = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });
    expect(after.revokedAt).toBeNull();
    expect(after.refreshTokens).toHaveLength(1);
  });

  it('treats a replayed token as theft: revokes the session and returns 401', async () => {
    const { userId, jar } = await registerUser();

    const rotated = readSetCookies(await refreshWith(jar).expect(200));

    const replay = await refreshWith(jar).expect(401);
    expect(replay.body.message).toBe('Invalid or expired refresh token');

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(session.revokedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post('/__test/protected')
      .set('Authorization', `Bearer ${rotated[ACCESS_TOKEN_COOKIE]}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/__test/protected')
      .set('Authorization', `Bearer ${jar[ACCESS_TOKEN_COOKIE]}`)
      .expect(401);
  });

  it('rejects refresh for a revoked session and issues no successor', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await refreshWith(jar).expect(401);

    expect(
      await prisma.refreshToken.count({ where: { sessionId: session.id } }),
    ).toBe(1);
  });

  it('rejects refresh for an expired session and issues no successor', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await refreshWith(jar).expect(401);

    expect(
      await prisma.refreshToken.count({ where: { sessionId: session.id } }),
    ).toBe(1);
  });

  it('clamps a successor refresh token to the absolute session expiry', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    const sessionExpiresAt = new Date(Date.now() + 60_000);
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: sessionExpiresAt },
    });

    const response = await refreshWith(jar).expect(200);

    const newRaw = cookieValue(setCookies(response), REFRESH_TOKEN_COOKIE);
    const successor = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(newRaw) },
    });
    expect(successor.expiresAt.getTime()).toBeLessThanOrEqual(
      sessionExpiresAt.getTime(),
    );

    const refreshCookie = requireCookie(
      setCookies(response),
      REFRESH_TOKEN_COOKIE,
    );
    const maxAge = Number(/Max-Age=(\d+)/i.exec(refreshCookie)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(60);
  });

  it('lets exactly one concurrent refresh win and revokes the session on replay', async () => {
    const { userId, jar } = await registerUser();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => refreshWith(jar)),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 401)).toHaveLength(4);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });
    expect(session.refreshTokens).toHaveLength(2);
    expect(
      session.refreshTokens.filter((token) => token.usedAt === null),
    ).toHaveLength(1);
    expect(session.revokedAt).not.toBeNull();
  });

  it('keeps the session revoked and every token unusable when refresh races logout', async () => {
    const { userId, jar } = await registerUser();
    const originalAccess = jar[ACCESS_TOKEN_COOKIE];
    const originalRefresh = jar[REFRESH_TOKEN_COOKIE];

    const [refreshResponse, logoutResponse] = await Promise.all([
      refreshWith(jar),
      logoutWith(jar),
    ]);

    expect(logoutResponse.status).toBe(204);
    expect([200, 401]).toContain(refreshResponse.status);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });

    expect(session.revokedAt).not.toBeNull();

    const successors = session.refreshTokens.filter(
      (token) => token.tokenHash !== sha256(originalRefresh),
    );
    expect(successors.length).toBeLessThanOrEqual(1);
    expect(successors.filter((token) => token.usedAt === null).length)
      .toBeLessThanOrEqual(1);

    await request(app.getHttpServer())
      .post('/__test/protected')
      .set('Authorization', `Bearer ${originalAccess}`)
      .expect(401);

    await refreshWith({ ...jar, [ACCESS_TOKEN_COOKIE]: originalAccess }).expect(
      401,
    );

    if (refreshResponse.status === 200) {
      const rotated = readSetCookies(refreshResponse);
      expect(rotated[REFRESH_TOKEN_COOKIE]).not.toBe(originalRefresh);

      await request(app.getHttpServer())
        .post('/__test/protected')
        .set('Authorization', `Bearer ${rotated[ACCESS_TOKEN_COOKIE]}`)
        .expect(401);

      await refreshWith(rotated).expect(401);
    }
  });

  it('rejects an access token once its session is revoked', async () => {
    const { jar } = await registerUser();

    await request(app.getHttpServer())
      .post('/__test/protected')
      .set('Authorization', `Bearer ${jar[ACCESS_TOKEN_COOKIE]}`)
      .expect(200);

    await logoutWith(jar).expect(204);

    await request(app.getHttpServer())
      .post('/__test/protected')
      .set('Authorization', `Bearer ${jar[ACCESS_TOKEN_COOKIE]}`)
      .expect(401);
  });

  it('clears every auth cookie with matching path and attributes', async () => {
    const { jar } = await registerUser();

    const response = await logoutWith(jar).expect(204);
    const cookies = setCookies(response);

    const access = requireCookie(cookies, ACCESS_TOKEN_COOKIE);
    expect(cookieValue(cookies, ACCESS_TOKEN_COOKIE)).toBe('');
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const refresh = requireCookie(cookies, REFRESH_TOKEN_COOKIE);
    expect(cookieValue(cookies, REFRESH_TOKEN_COOKIE)).toBe('');
    expect(refresh).toMatch(/Path=\/auth/i);
    expect(refresh).toMatch(/HttpOnly/i);

    const csrf = requireCookie(cookies, CSRF_COOKIE);
    expect(cookieValue(cookies, CSRF_COOKIE)).toBe('');
    expect(csrf).toMatch(/Path=\//i);
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('is idempotent and revokes only the current device session', async () => {
    const { email, userId, jar } = await registerUser('device-a');
    expect(jar[REFRESH_TOKEN_COOKIE].length).toBeGreaterThan(0);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', 'device-b')
      .send({ email, password: PASSWORD })
      .expect(200);
    const deviceBJar = readSetCookies(loginResponse);

    await logoutWith(deviceBJar).expect(204);
    await logoutWith(deviceBJar).expect(204);

    const sessions = await prisma.authSession.findMany({ where: { userId } });
    const deviceA = sessions.find((session) => session.userAgent === 'device-a');
    const deviceB = sessions.find((session) => session.userAgent === 'device-b');
    expect(deviceB!.revokedAt).not.toBeNull();
    expect(deviceA!.revokedAt).toBeNull();
  });

  it('logs out with an expired access token when the refresh cookie identifies the session', async () => {
    const { userId, jar } = await registerUser();
    const jwt = new JwtService({});
    const expiredAccess = await jwt.signAsync(
      { sub: userId, sid: 'expired-session' },
      { secret: authConfig.accessSecret, expiresIn: -10 },
    );

    const expiredJar: CookieJar = {
      ...jar,
      [ACCESS_TOKEN_COOKIE]: expiredAccess,
    };
    await logoutWith(expiredJar).expect(204);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(session.revokedAt).not.toBeNull();
  });

  it('enforces CSRF and Origin on both endpoints', async () => {
    const { jar } = await registerUser();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookieHeader(jar))
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', 'http://evil.test')
      .set(CSRF_HEADER, jar[CSRF_COOKIE])
      .set('Cookie', cookieHeader(jar))
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookieHeader(jar))
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', 'http://evil.test')
      .set(CSRF_HEADER, jar[CSRF_COOKIE])
      .set('Cookie', cookieHeader(jar))
      .expect(403);
  });
});

describe('browser-auth gate for refresh and logout (e2e)', () => {
  const trustedOrigin = 'http://localhost:3000';

  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  const trackedEmails = new Set<string>();

  async function registerUser(): Promise<{ userId: string; jar: CookieJar }> {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return {
      userId: response.body.user.id as string,
      jar: readSetCookies(response),
    };
  }

  const cookiePair = (jar: CookieJar, token: string) => [
    ...cookieHeader(jar),
    `${CSRF_COOKIE}=${token}`,
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
    })
      .overrideProvider(AuthConfig)
      .useValue({
        browserAuthEnabled: false,
        csrfSecret: process.env.CSRF_SECRET,
        csrfSecretOrUndefined: process.env.CSRF_SECRET,
        trustedOrigins: [trustedOrigin],
        cookiePolicy: { secure: false, sameSite: 'lax' },
        accessSecret: process.env.JWT_ACCESS_SECRET,
        accessTtlMs: 900_000,
        refreshTtlMs: 604_800_000,
        sessionTtlMs: 604_800_000,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    csrfToken = generateCsrfToken(app.get(AuthConfig).csrfSecret);
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('lets cookie-authenticated logout through with a trusted origin and valid CSRF, clearing all cookies without revoking', async () => {
    const { userId, jar } = await registerUser();

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, csrfToken)
      .set('Cookie', cookiePair(jar, csrfToken))
      .expect(204);

    const cleared = setCookies(response);
    expect(cookieValue(cleared, ACCESS_TOKEN_COOKIE)).toBe('');
    expect(cookieValue(cleared, REFRESH_TOKEN_COOKIE)).toBe('');
    expect(cookieValue(cleared, CSRF_COOKIE)).toBe('');

    const access = requireCookie(cleared, ACCESS_TOKEN_COOKIE);
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(requireCookie(cleared, REFRESH_TOKEN_COOKIE)).toMatch(/Path=\/auth/i);
    const csrf = requireCookie(cleared, CSRF_COOKIE);
    expect(csrf).toMatch(/Path=\//i);
    expect(csrf).not.toMatch(/HttpOnly/i);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(session.revokedAt).toBeNull();
  });

  it('rejects cookie-authenticated logout when disabled and CSRF is missing or invalid', async () => {
    const { jar } = await registerUser();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookiePair(jar, csrfToken))
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, 'forged')
      .set('Cookie', cookiePair(jar, 'forged'))
      .expect(403);
  });

  it('rejects cookie-authenticated logout when disabled and the origin is untrusted', async () => {
    const { jar } = await registerUser();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', 'http://evil.test')
      .set(CSRF_HEADER, csrfToken)
      .set('Cookie', cookiePair(jar, csrfToken))
      .expect(403);
  });

  it('still rejects cookie-authenticated refresh when browser auth is disabled', async () => {
    const { userId, jar } = await registerUser();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', trustedOrigin)
      .set(CSRF_HEADER, csrfToken)
      .set('Cookie', cookiePair(jar, csrfToken))
      .expect(403);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(session.revokedAt).toBeNull();
  });

  it('refuses cookie-based refresh at the service gate when browser auth is disabled', async () => {
    const { userId, jar } = await registerUser();

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Authorization', 'Bearer guard-bypass')
      .set('Origin', trustedOrigin)
      .set('CSRF_HEADER', csrfToken)
      .set('Cookie', cookiePair(jar, csrfToken));
    expect(refreshResponse.status).toBe(401);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(session.revokedAt).toBeNull();
  });

  it('clears cookies and returns 204 on logout without a cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(204);

    const cleared = setCookies(response);
    expect(requireCookie(cleared, ACCESS_TOKEN_COOKIE)).toMatch(/HttpOnly/i);
    expect(requireCookie(cleared, REFRESH_TOKEN_COOKIE)).toMatch(/Path=\/auth/i);
    expect(requireCookie(cleared, CSRF_COOKIE)).toMatch(/Path=\//i);
  });
});

describe('GET /auth/session (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authConfig: AuthConfig;
  const trackedEmails = new Set<string>();

  const getSession = (cookies: string[]) =>
    request(app.getHttpServer()).get('/auth/session').set('Cookie', cookies);

  async function registerUser(): Promise<{
    userId: string;
    email: string;
    jar: CookieJar;
  }> {
    const body = validBody();
    trackedEmails.add(body.email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201);

    return {
      userId: response.body.user.id as string,
      email: body.email,
      jar: readSetCookies(response),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    authConfig = app.get(AuthConfig);
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('returns the public profile for a live session without rotating tokens', async () => {
    const { userId, email, jar } = await registerUser();
    const before = await prisma.authSession.findFirstOrThrow({
      where: { userId },
      include: { refreshTokens: true },
    });

    const response = await getSession(cookieHeader(jar)).expect(200);

    expect(response.body).toEqual({
      user: {
        id: userId,
        email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toContain('passwordHash');
    expect(bodyText).not.toContain(jar[ACCESS_TOKEN_COOKIE]);
    expect(bodyText).not.toContain(jar[REFRESH_TOKEN_COOKIE]);
    expect(setCookies(response)).toHaveLength(0);

    const after = await prisma.authSession.findFirstOrThrow({
      where: { id: before.id },
      include: { refreshTokens: true },
    });
    expect(after.revokedAt).toBeNull();
    expect(after.lastUsedAt).toEqual(before.lastUsedAt);
    expect(after.refreshTokens).toHaveLength(before.refreshTokens.length);
    expect(after.refreshTokens.every((token) => token.usedAt === null)).toBe(
      true,
    );
  });

  it('rejects a request without an access credential', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/session')
      .expect(401);

    expect(response.body.message).toBe('Authentication required');
  });

  it('rejects an invalid access token', async () => {
    const response = await getSession([
      `${ACCESS_TOKEN_COOKIE}=not-a-valid-token`,
    ]).expect(401);

    expect(response.body.message).toBe('Invalid or expired access token');
  });

  it('rejects an expired access token', async () => {
    const { userId } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    const expired = await new JwtService({}).signAsync(
      { sub: userId, sid: session.id },
      { secret: authConfig.accessSecret, expiresIn: -10 },
    );

    const response = await getSession([
      `${ACCESS_TOKEN_COOKIE}=${expired}`,
    ]).expect(401);

    expect(response.body.message).toBe('Invalid or expired access token');
  });

  it('rejects a revoked session', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const response = await getSession(cookieHeader(jar)).expect(401);

    expect(response.body.message).toBe('Session is no longer active');
  });

  it('rejects an expired session', async () => {
    const { userId, jar } = await registerUser();
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await getSession(cookieHeader(jar)).expect(401);

    expect(response.body.message).toBe('Session is no longer active');
  });
});

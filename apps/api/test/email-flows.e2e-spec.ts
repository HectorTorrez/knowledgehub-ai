import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
} from '../src/email/email-sender.port.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';

const PASSWORD = 'correct horse battery staple';

interface Account {
  email: string;
  cookies: string[];
  accessToken: string;
}

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] ?? []) as unknown as string[];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Expected cookie "${name}" to be set`);
  return cookie.slice(name.length + 1).split(';')[0] ?? '';
}

function linkToken(message: EmailMessage | undefined, path: string): string {
  const match = new RegExp(`${path}\\?token=([\\w-]+)`).exec(
    message?.text ?? '',
  );
  if (!match?.[1]) throw new Error(`No ${path} link in the email`);
  return match[1];
}

describe('Email flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const outbox: EmailMessage[] = [];
  const trackedEmails = new Set<string>();
  const trackedOrganizations = new Set<string>();

  const lastEmailTo = (to: string) =>
    outbox.filter((message) => message.to === to).at(-1);

  async function register(locale?: 'en' | 'es'): Promise<Account> {
    const email = `user-${randomUUID()}@example.test`;
    trackedEmails.add(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: 'Ada',
        lastName: 'Lovelace',
        ...(locale ? { locale } : {}),
      })
      .expect(201);
    return toAccount(email, response);
  }

  function toAccount(email: string, response: request.Response): Account {
    const cookies = setCookies(response);
    return {
      email,
      cookies,
      accessToken: cookieValue(cookies, ACCESS_TOKEN_COOKIE),
    };
  }

  function post(account: Account, path: string, body: object = {}) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(body);
  }

  function verifyEmail(token: string) {
    return request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARIZER)
      .useValue({
        summarize: async () => ({ summary: 'test summary', keyTopics: [] }),
      })
      .overrideProvider(EMAIL_SENDER)
      .useValue({
        send: async (message: EmailMessage) => {
          outbox.push(message);
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [...trackedOrganizations] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [...trackedEmails] } },
    });
    await app.close();
  });

  it('sends a welcome email on registration and starts unverified', async () => {
    const account = await register('es');

    const message = lastEmailTo(account.email);
    expect(message?.subject).toContain('Te damos la bienvenida');

    const session = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', account.cookies)
      .expect(200);
    expect(session.body.user.emailVerified).toBe(false);
  });

  it('verifies the email with the emailed link, once', async () => {
    const account = await register();
    const token = linkToken(lastEmailTo(account.email), '/verify-email');

    await verifyEmail(token).expect(204);
    await verifyEmail(token).expect(404);

    const session = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', account.cookies)
      .expect(200);
    expect(session.body.user.emailVerified).toBe(true);
  });

  it('rejects unknown and expired verification tokens', async () => {
    await verifyEmail('not-a-real-token').expect(404);

    const account = await register();
    const token = linkToken(lastEmailTo(account.email), '/verify-email');
    await prisma.emailVerificationToken.updateMany({
      where: { user: { email: account.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await verifyEmail(token).expect(404);
  });

  it('resending invalidates the previous link', async () => {
    const account = await register();
    const first = linkToken(lastEmailTo(account.email), '/verify-email');

    await post(account, '/auth/verify-email/resend').expect(204);
    const second = linkToken(lastEmailTo(account.email), '/verify-email');

    expect(second).not.toBe(first);
    await verifyEmail(first).expect(404);
    await verifyEmail(second).expect(204);
  });

  it('requires a session to resend', async () => {
    await request(app.getHttpServer())
      .post('/auth/verify-email/resend')
      .send({})
      .expect(401);
  });

  it('emails invitations and requires a verified email to accept them', async () => {
    const owner = await register();
    const created = await post(owner, '/organizations', {
      name: `Email flows ${randomUUID()}`,
    }).expect(201);
    const organizationId = created.body.organization.id as string;
    trackedOrganizations.add(organizationId);

    const inviteeEmail = `user-${randomUUID()}@example.test`;
    const invited = await post(
      owner,
      `/organizations/${organizationId}/invitations`,
      { email: inviteeEmail, role: 'MEMBER' },
    ).expect(201);
    expect(invited.body.emailDelivered).toBe(true);

    const invitationEmail = lastEmailTo(inviteeEmail);
    expect(invitationEmail?.subject).toContain('Ada Lovelace');
    const invitationToken = linkToken(invitationEmail, '/invite');
    expect(invitationToken).toBe(invited.body.invitation.token);

    trackedEmails.add(inviteeEmail);
    const signup = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: inviteeEmail,
        password: PASSWORD,
        firstName: 'Grace',
        lastName: 'Hopper',
      })
      .expect(201);
    const invitee = toAccount(inviteeEmail, signup);

    await post(invitee, '/invitations/accept', {
      token: invitationToken,
    }).expect(403);

    const verifyToken = linkToken(
      outbox.filter(
        (message) =>
          message.to === inviteeEmail && message.subject.startsWith('Welcome'),
      )[0],
      '/verify-email',
    );
    await verifyEmail(verifyToken).expect(204);

    const accepted = await post(invitee, '/invitations/accept', {
      token: invitationToken,
    }).expect(200);
    expect(accepted.body).toEqual({ organizationId });
  });

  async function inviteToNewOrganization(inviteeEmail: string) {
    const owner = await register();
    const created = await post(owner, '/organizations', {
      name: `Invite signup ${randomUUID()}`,
    }).expect(201);
    const organizationId = created.body.organization.id as string;
    trackedOrganizations.add(organizationId);

    const invited = await post(
      owner,
      `/organizations/${organizationId}/invitations`,
      { email: inviteeEmail, role: 'MEMBER' },
    ).expect(201);

    return {
      organizationId,
      organizationName: created.body.organization.name as string,
      token: invited.body.invitation.token as string,
    };
  }

  function anonymousPost(path: string, body: object) {
    return request(app.getHttpServer()).post(path).send(body);
  }

  it('creates a verified account automatically for an invitee without one', async () => {
    const inviteeEmail = `user-${randomUUID()}@example.test`;
    trackedEmails.add(inviteeEmail);
    const { organizationId, organizationName, token } =
      await inviteToNewOrganization(inviteeEmail);

    const preview = await anonymousPost('/invitations/preview', {
      token,
    }).expect(200);
    expect(preview.body).toEqual({
      email: inviteeEmail,
      role: 'MEMBER',
      organizationName,
      accountExists: false,
    });

    const accepted = await anonymousPost('/invitations/accept-new-account', {
      token,
      firstName: 'Grace',
      lastName: 'Hopper',
      password: PASSWORD,
    }).expect(201);
    expect(accepted.body.organizationId).toBe(organizationId);
    expect(accepted.body.user).toMatchObject({
      email: inviteeEmail,
      emailVerified: true,
    });

    const invitee = toAccount(inviteeEmail, accepted);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${invitee.accessToken}`)
      .expect(200);

    await anonymousPost('/invitations/preview', { token }).expect(404);
    await anonymousPost('/invitations/accept-new-account', {
      token,
      firstName: 'Mallory',
      lastName: 'Replay',
      password: PASSWORD,
    }).expect(404);
  });

  it('asks an invitee who already has an account to sign in instead', async () => {
    const invitee = await register();
    const { token } = await inviteToNewOrganization(invitee.email);

    const preview = await anonymousPost('/invitations/preview', {
      token,
    }).expect(200);
    expect(preview.body.accountExists).toBe(true);

    await anonymousPost('/invitations/accept-new-account', {
      token,
      firstName: 'Grace',
      lastName: 'Hopper',
      password: PASSWORD,
    }).expect(409);

    await post(invitee, '/invitations/accept', { token }).expect(403);
  });

  it('rejects unknown invitation tokens without creating an account', async () => {
    await anonymousPost('/invitations/preview', {
      token: 'not-a-real-token',
    }).expect(404);
    await anonymousPost('/invitations/accept-new-account', {
      token: 'not-a-real-token',
      firstName: 'Grace',
      lastName: 'Hopper',
      password: PASSWORD,
    }).expect(404);
  });

  const NEW_PASSWORD = 'a brand new passphrase';

  function login(email: string, password: string) {
    return anonymousPost('/auth/login', { email, password });
  }

  it('resets a forgotten password with the emailed link, once', async () => {
    const account = await register();

    await anonymousPost('/auth/password-reset/request', {
      email: account.email.toUpperCase(),
      locale: 'es',
    }).expect(204);
    const message = lastEmailTo(account.email);
    expect(message?.subject).toContain('Restablece tu contraseña');
    const token = linkToken(message, '/reset-password');

    await anonymousPost('/auth/password-reset/confirm', {
      token,
      password: NEW_PASSWORD,
    }).expect(204);
    await anonymousPost('/auth/password-reset/confirm', {
      token,
      password: NEW_PASSWORD,
    }).expect(404);

    await login(account.email, PASSWORD).expect(401);
    await login(account.email, NEW_PASSWORD).expect(200);
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', account.cookies)
      .expect(401);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const email = `nobody-${randomUUID()}@example.test`;

    await anonymousPost('/auth/password-reset/request', { email }).expect(204);

    expect(lastEmailTo(email)).toBeUndefined();
  });

  it('rejects expired and superseded reset links', async () => {
    const account = await register();
    await anonymousPost('/auth/password-reset/request', {
      email: account.email,
    }).expect(204);
    const first = linkToken(lastEmailTo(account.email), '/reset-password');
    await anonymousPost('/auth/password-reset/request', {
      email: account.email,
    }).expect(204);
    const second = linkToken(lastEmailTo(account.email), '/reset-password');

    await anonymousPost('/auth/password-reset/confirm', {
      token: first,
      password: NEW_PASSWORD,
    }).expect(404);

    await prisma.passwordResetToken.updateMany({
      where: { user: { email: account.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await anonymousPost('/auth/password-reset/confirm', {
      token: second,
      password: NEW_PASSWORD,
    }).expect(404);

    await login(account.email, PASSWORD).expect(200);
  });
});

import { describe, expect, it } from 'vitest';
import {
  invitationEmail,
  verificationEmail,
  welcomeEmail,
} from './templates.js';

describe('welcomeEmail', () => {
  it('links to the verification URL in both the HTML and text bodies', () => {
    const message = welcomeEmail({
      to: 'ada@example.com',
      firstName: 'Ada',
      verifyUrl: 'https://app.example.com/verify-email?token=abc',
      expiresInHours: 48,
      locale: 'en',
    });

    expect(message.to).toBe('ada@example.com');
    expect(message.subject).toContain('Welcome');
    expect(message.html).toContain(
      'href="https://app.example.com/verify-email?token=abc"',
    );
    expect(message.text).toContain(
      'https://app.example.com/verify-email?token=abc',
    );
    expect(message.text).toContain('48 hours');
  });

  it('writes Spanish copy for the es locale', () => {
    const message = welcomeEmail({
      to: 'ada@example.com',
      firstName: 'Ada',
      verifyUrl: 'https://app.example.com/verify-email?token=abc',
      expiresInHours: 48,
      locale: 'es',
    });

    expect(message.subject).toContain('Te damos la bienvenida');
    expect(message.html).toContain('Confirmar email');
  });

  it('escapes user-controlled names in the HTML body', () => {
    const message = welcomeEmail({
      to: 'ada@example.com',
      firstName: '<script>alert(1)</script>',
      verifyUrl: 'https://app.example.com/verify-email?token=abc',
      expiresInHours: 48,
      locale: 'en',
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});

describe('verificationEmail', () => {
  it('asks to confirm the email without repeating the welcome', () => {
    const message = verificationEmail({
      to: 'ada@example.com',
      firstName: 'Ada',
      verifyUrl: 'https://app.example.com/verify-email?token=new',
      expiresInHours: 48,
      locale: 'en',
    });

    expect(message.subject).toBe('Confirm your KnowledgeHub email');
    expect(message.html).toContain(
      'href="https://app.example.com/verify-email?token=new"',
    );
  });
});

describe('invitationEmail', () => {
  const input = {
    to: 'grace@example.com',
    inviterName: 'Ada Lovelace',
    organizationName: 'Acme & <Co>',
    role: 'ADMIN' as const,
    acceptUrl: 'https://app.example.com/invitations/accept?token=t0k',
    expiresInDays: 7,
  };

  it('names the inviter, organization and role', () => {
    const message = invitationEmail({ ...input, locale: 'en' });

    expect(message.subject).toBe(
      'Ada Lovelace invited you to Acme & <Co> on KnowledgeHub',
    );
    expect(message.html).toContain('Acme &amp; &lt;Co&gt;');
    expect(message.html).toContain('as admin');
    expect(message.html).toContain(
      'href="https://app.example.com/invitations/accept?token=t0k"',
    );
  });

  it('localizes the role for the es locale', () => {
    const message = invitationEmail({ ...input, locale: 'es' });

    expect(message.html).toContain('como administrador');
    expect(message.text).toContain('7 días');
  });
});

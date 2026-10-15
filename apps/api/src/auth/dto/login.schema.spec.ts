import { describe, expect, it } from 'vitest';
import { loginSchema } from './login.schema.js';

const validBody = {
  email: 'user@example.com',
  password: 'correct horse battery',
};

describe('loginSchema', () => {
  it('accepts a valid payload and trims surrounding email whitespace', () => {
    const parsed = loginSchema.parse({
      ...validBody,
      email: '  user@example.com  ',
    });

    expect(parsed.email).toBe('user@example.com');
  });

  it('requires email and password', () => {
    for (const key of ['email', 'password'] as const) {
      const body: Record<string, unknown> = { ...validBody };
      delete body[key];
      expect(loginSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects an empty or whitespace-only email', () => {
    expect(loginSchema.safeParse({ ...validBody, email: '' }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ ...validBody, email: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects an invalid email', () => {
    expect(
      loginSchema.safeParse({ ...validBody, email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rejects incorrectly typed fields', () => {
    expect(
      loginSchema.safeParse({ ...validBody, password: 12345678 }).success,
    ).toBe(false);
  });

  it('requires a non-empty password but does not enforce the registration minimum', () => {
    expect(
      loginSchema.safeParse({ ...validBody, password: '' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ ...validBody, password: 'short' }).success,
    ).toBe(true);
  });

  it('rejects a password longer than the supported maximum', () => {
    expect(
      loginSchema.safeParse({ ...validBody, password: 'a'.repeat(129) })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ ...validBody, password: 'a'.repeat(128) })
        .success,
    ).toBe(true);
  });

  it('never modifies the password', () => {
    const password = '  keep   my   spaces  ';
    const parsed = loginSchema.parse({ ...validBody, password });
    expect(parsed.password).toBe(password);
  });

  it('rejects unknown fields', () => {
    expect(
      loginSchema.safeParse({ ...validBody, isAdmin: true }).success,
    ).toBe(false);
  });
});

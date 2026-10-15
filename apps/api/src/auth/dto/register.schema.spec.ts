import { describe, expect, it } from 'vitest';
import { registerSchema } from './register.schema.js';

const validBody = {
  email: 'user@example.com',
  password: 'correct horse battery',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

describe('registerSchema', () => {
  it('accepts a valid payload and trims surrounding whitespace', () => {
    const parsed = registerSchema.parse({
      ...validBody,
      email: '  user@example.com  ',
      firstName: '  Ada  ',
    });

    expect(parsed.email).toBe('user@example.com');
    expect(parsed.firstName).toBe('Ada');
  });

  it('requires all fields', () => {
    for (const key of ['email', 'password', 'firstName', 'lastName'] as const) {
      const body: Record<string, unknown> = { ...validBody };
      delete body[key];
      expect(registerSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects incorrectly typed fields', () => {
    expect(
      registerSchema.safeParse({ ...validBody, password: 123456789012 })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validBody, firstName: ['Ada'] }).success,
    ).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(
      registerSchema.safeParse({ ...validBody, email: 'not-an-email' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validBody, email: 'a@b@c.com' }).success,
    ).toBe(false);
  });

  it('enforces the password length policy (12-128)', () => {
    expect(
      registerSchema.safeParse({ ...validBody, password: 'a'.repeat(11) })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validBody, password: 'a'.repeat(12) })
        .success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validBody, password: 'a'.repeat(128) })
        .success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validBody, password: 'a'.repeat(129) })
        .success,
    ).toBe(false);
  });

  it('never modifies the password', () => {
    const password = '  keep   my   spaces  ';
    const parsed = registerSchema.parse({ ...validBody, password });
    expect(parsed.password).toBe(password);
  });

  it('rejects empty or whitespace-only names', () => {
    expect(
      registerSchema.safeParse({ ...validBody, firstName: '' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validBody, lastName: '   ' }).success,
    ).toBe(false);
  });

  it('rejects names longer than 100 characters', () => {
    expect(
      registerSchema.safeParse({ ...validBody, firstName: 'a'.repeat(101) })
        .success,
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      registerSchema.safeParse({ ...validBody, isAdmin: true }).success,
    ).toBe(false);
  });
});

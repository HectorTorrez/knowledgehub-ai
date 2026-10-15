import { describe, expect, it } from 'vitest';
import { createOrganizationSchema } from './create-organization.schema.js';

describe('createOrganizationSchema', () => {
  it('accepts a valid name', () => {
    const parsed = createOrganizationSchema.parse({ name: 'Acme Inc.' });
    expect(parsed.name).toBe('Acme Inc.');
  });

  it('trims surrounding whitespace', () => {
    const parsed = createOrganizationSchema.parse({ name: '  Acme Inc.  ' });
    expect(parsed.name).toBe('Acme Inc.');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(createOrganizationSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects a name longer than 100 characters', () => {
    expect(
      createOrganizationSchema.safeParse({ name: 'a'.repeat(101) }).success,
    ).toBe(false);
  });

  it('accepts a name of exactly 100 characters', () => {
    expect(
      createOrganizationSchema.safeParse({ name: 'a'.repeat(100) }).success,
    ).toBe(true);
  });

  it('rejects a missing or incorrectly typed name', () => {
    expect(createOrganizationSchema.safeParse({}).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: 123 }).success).toBe(
      false,
    );
    expect(createOrganizationSchema.safeParse({ name: ['Acme'] }).success).toBe(
      false,
    );
  });

  it('rejects unknown properties', () => {
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', role: 'OWNER' })
        .success,
    ).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ name: 'Acme', userId: 'user-1' })
        .success,
    ).toBe(false);
  });
});

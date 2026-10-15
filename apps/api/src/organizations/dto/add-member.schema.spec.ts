import { describe, expect, it } from 'vitest';
import { addMemberSchema } from './add-member.schema.js';

describe('addMemberSchema', () => {
  it('accepts a valid email', () => {
    const parsed = addMemberSchema.parse({ email: 'person@example.com' });
    expect(parsed.email).toBe('person@example.com');
  });

  it('trims surrounding whitespace', () => {
    const parsed = addMemberSchema.parse({ email: '  person@example.com  ' });
    expect(parsed.email).toBe('person@example.com');
  });

  it('rejects a missing, empty or non-string email', () => {
    expect(addMemberSchema.safeParse({}).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: '' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: '   ' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: 123 }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: null }).success).toBe(false);
  });

  it('rejects an email that is not a valid address', () => {
    for (const email of ['not-an-email', 'a@', '@b.com', 'a b@c.com']) {
      expect(addMemberSchema.safeParse({ email }).success).toBe(false);
    }
  });

  it('rejects an email longer than 254 characters', () => {
    const email = `${'a'.repeat(250)}@example.com`;
    expect(email.length).toBeGreaterThan(254);
    expect(addMemberSchema.safeParse({ email }).success).toBe(false);
  });

  it('rejects client-supplied role, user id or organization id', () => {
    for (const extra of [
      { role: 'OWNER' },
      { role: 'MEMBER' },
      { userId: 'user-1' },
      { organizationId: 'org-1' },
    ]) {
      expect(
        addMemberSchema.safeParse({ email: 'person@example.com', ...extra })
          .success,
      ).toBe(false);
    }
  });
});

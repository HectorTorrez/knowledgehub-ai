import { describe, expect, it } from 'vitest';
import { updateMemberRoleSchema } from './update-member-role.schema.js';

describe('updateMemberRoleSchema', () => {
  it('accepts each supported role', () => {
    expect(updateMemberRoleSchema.parse({ role: 'OWNER' }).role).toBe('OWNER');
    expect(updateMemberRoleSchema.parse({ role: 'MEMBER' }).role).toBe('MEMBER');
  });

  it('rejects a missing, non-string or unsupported role', () => {
    for (const role of [
      undefined,
      null,
      '',
      'owner',
      'ADMIN',
      123,
      ['OWNER'],
    ]) {
      expect(updateMemberRoleSchema.safeParse({ role }).success).toBe(false);
    }
    expect(updateMemberRoleSchema.safeParse({}).success).toBe(false);
  });

  it('rejects client-supplied target or organization fields', () => {
    for (const extra of [
      { userId: 'user-1' },
      { organizationId: 'org-1' },
      { email: 'person@example.com' },
    ]) {
      expect(
        updateMemberRoleSchema.safeParse({ role: 'OWNER', ...extra }).success,
      ).toBe(false);
    }
  });
});

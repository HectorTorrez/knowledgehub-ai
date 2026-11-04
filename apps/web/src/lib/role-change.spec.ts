import { describe, expect, it } from 'vitest';
import { needsRoleChangeConfirmation } from './role-change';

describe('needsRoleChangeConfirmation', () => {
  it('confirms every promotion to owner', () => {
    expect(needsRoleChangeConfirmation('ADMIN', 'OWNER')).toBe(true);
    expect(needsRoleChangeConfirmation('VIEWER', 'OWNER')).toBe(true);
  });

  it('confirms every demotion', () => {
    expect(needsRoleChangeConfirmation('OWNER', 'ADMIN')).toBe(true);
    expect(needsRoleChangeConfirmation('ADMIN', 'MEMBER')).toBe(true);
    expect(needsRoleChangeConfirmation('MEMBER', 'VIEWER')).toBe(true);
  });

  it('applies promotions below owner without confirmation', () => {
    expect(needsRoleChangeConfirmation('VIEWER', 'MEMBER')).toBe(false);
    expect(needsRoleChangeConfirmation('MEMBER', 'ADMIN')).toBe(false);
  });
});

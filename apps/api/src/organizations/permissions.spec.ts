import { describe, expect, it } from 'vitest';
import { can, canManageRole, capabilities, organizationRoles } from './permissions.js';
import type { Capability, PolicyRole } from './permissions.js';

const expected: Record<PolicyRole, readonly Capability[]> = {
  OWNER: capabilities,
  ADMIN: ['documents.view', 'documents.write', 'documents.delete', 'answers.ask', 'search', 'conversations.viewOwn', 'members.manage', 'organization.manage', 'insights.view'],
  MEMBER: ['documents.view', 'documents.write', 'documents.delete', 'answers.ask', 'search', 'conversations.viewOwn'],
  VIEWER: ['documents.view', 'answers.ask', 'search', 'conversations.viewOwn'],
};

describe('organization permissions', () => {
  it.each(organizationRoles)('enforces the complete capability matrix for %s', (role) => {
    for (const capability of capabilities) {
      expect(can(role, capability), capability).toBe(expected[role].includes(capability));
    }
  });

  it.each(organizationRoles)('enforces role management boundaries for %s', (actor) => {
    for (const target of organizationRoles) {
      expect(canManageRole(actor, target), target).toBe(
        actor === 'OWNER' || (actor === 'ADMIN' && target !== 'OWNER'),
      );
    }
  });
});

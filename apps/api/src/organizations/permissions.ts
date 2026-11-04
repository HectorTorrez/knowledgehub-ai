export const organizationRoles = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
] as const;
export type PolicyRole = (typeof organizationRoles)[number];

export const capabilities = [
  'documents.view',
  'documents.write',
  'documents.delete',
  'answers.ask',
  'search',
  'conversations.viewOwn',
  'members.manage',
  'owners.manage',
  'organization.manage',
  'organization.delete',
  'insights.view',
] as const;
export type Capability = (typeof capabilities)[number];

const readCapabilities: readonly Capability[] = [
  'documents.view',
  'answers.ask',
  'search',
  'conversations.viewOwn',
];
const memberCapabilities: readonly Capability[] = [
  ...readCapabilities,
  'documents.write',
  'documents.delete',
];
const adminCapabilities: readonly Capability[] = [
  ...memberCapabilities,
  'members.manage',
  'organization.manage',
  'insights.view',
];

const permissions: Record<PolicyRole, readonly Capability[]> = {
  OWNER: capabilities,
  ADMIN: adminCapabilities,
  MEMBER: memberCapabilities,
  VIEWER: readCapabilities,
};

export function capabilitiesFor(role: PolicyRole): readonly Capability[] {
  return permissions[role];
}

export function can(role: PolicyRole, capability: Capability): boolean {
  return permissions[role].includes(capability);
}

export function canManageRole(actor: PolicyRole, target: PolicyRole): boolean {
  return can(actor, target === 'OWNER' ? 'owners.manage' : 'members.manage');
}

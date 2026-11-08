import { describe, expect, it } from 'vitest';
import { hasTenantScope } from './tenant-scope.js';

describe('hasTenantScope', () => {
  it('accepts a concrete organization id at the top level or in AND', () => {
    expect(hasTenantScope({ organizationId: 'org-a' })).toBe(true);
    expect(
      hasTenantScope({
        AND: [{ id: 'id' }, { AND: { organizationId: 'org-a' } }],
      }),
    ).toBe(true);
  });

  it('rejects scopes that do not constrain every possible result', () => {
    expect(hasTenantScope(undefined)).toBe(false);
    expect(hasTenantScope({ organizationId: undefined })).toBe(false);
    expect(hasTenantScope({ organizationId: '' })).toBe(false);
    expect(hasTenantScope({ organizationId: { not: 'org-a' } })).toBe(false);
    expect(hasTenantScope({ OR: [{ organizationId: 'org-a' }, {}] })).toBe(
      false,
    );
    expect(hasTenantScope({ NOT: { organizationId: 'org-a' } })).toBe(false);
  });
});

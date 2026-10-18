import type {
  DocumentSummary,
  OrganizationRole,
  OrganizationSummary,
  PublicUser,
} from '@knowledgehub/shared-types';
import { describe, expect, it } from 'vitest';
import type { SessionState } from '~/lib/auth/session';
import {
  buildDocumentsTool,
  buildOrganizationsTool,
  buildSessionTool,
  type WebMcpToolDeps,
} from './tools';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function publicUser(): PublicUser {
  return {
    id: 'user-1',
    email: 'hector@example.com',
    firstName: 'Hector',
    lastName: 'Torrez',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function organization(
  id: string,
  name: string,
  role: OrganizationRole = 'MEMBER',
): OrganizationSummary {
  return { id, name, role, createdAt: TIMESTAMP, updatedAt: TIMESTAMP };
}

function document(id: string): DocumentSummary {
  return {
    id,
    title: `Document ${id}`,
    status: 'READY',
    originalFileName: 'handbook.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    failureReason: null,
    failureKind: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function deps(overrides: Partial<WebMcpToolDeps> = {}): WebMcpToolDeps {
  return {
    loadSession: async (): Promise<SessionState> => ({
      status: 'authenticated',
      user: publicUser(),
    }),
    loadOrganizations: async () => [organization('org-a', 'Acme')],
    loadDocuments: async () => [document('doc-1')],
    getActiveOrganizationId: () => 'org-a',
    ...overrides,
  };
}

describe('get_session tool', () => {
  it('projects the user and the open organization', async () => {
    const spec = buildSessionTool(
      deps({
        loadOrganizations: async () => [organization('org-a', 'Acme', 'OWNER')],
      }),
    );

    await expect(spec.execute()).resolves.toEqual({
      user: { id: 'user-1', email: 'hector@example.com' },
      activeOrganization: { id: 'org-a', name: 'Acme', role: 'OWNER' },
    });
    expect(spec.definition.annotations?.readOnlyHint).toBe(true);
  });

  it('reports no active organization when none is open', async () => {
    const spec = buildSessionTool(deps({ getActiveOrganizationId: () => undefined }));

    await expect(spec.execute()).resolves.toMatchObject({
      activeOrganization: null,
    });
  });

  it('refuses to report a session that is not authenticated', async () => {
    const spec = buildSessionTool(
      deps({ loadSession: async (): Promise<SessionState> => ({ status: 'unauthenticated' }) }),
    );

    await expect(spec.execute()).rejects.toThrow(/signed-in/);
  });

  it('rejects when the open organization changed while loading', async () => {
    let active: string | undefined = 'org-a';
    const spec = buildSessionTool(
      deps({
        getActiveOrganizationId: () => active,
        loadOrganizations: async () => {
          active = 'org-b';
          return [organization('org-a', 'Acme')];
        },
      }),
    );

    await expect(spec.execute()).rejects.toThrow(/changed/);
  });
});

describe('list_organizations tool', () => {
  it('projects the organizations the user belongs to', async () => {
    const spec = buildOrganizationsTool(
      deps({
        loadOrganizations: async () => [
          organization('org-a', 'Acme', 'OWNER'),
          organization('org-b', 'Globex'),
        ],
      }),
    );

    await expect(spec.execute()).resolves.toEqual({
      organizations: [
        { id: 'org-a', name: 'Acme', role: 'OWNER' },
        { id: 'org-b', name: 'Globex', role: 'MEMBER' },
      ],
    });
    expect(spec.definition.annotations?.readOnlyHint).toBe(true);
  });
});

describe('list_documents tool', () => {
  it('labels the result with the open organization', async () => {
    const spec = buildDocumentsTool(
      deps({ loadOrganizations: async () => [organization('org-a', 'Acme')] }),
    );

    await expect(spec.execute()).resolves.toEqual({
      organizationId: 'org-a',
      organizationName: 'Acme',
      documents: [
        {
          id: 'doc-1',
          title: 'Document doc-1',
          status: 'READY',
          failureKind: null,
        },
      ],
    });
    expect(spec.definition.annotations?.untrustedContentHint).toBe(true);
  });

  it('refuses to run without an open organization', async () => {
    const spec = buildDocumentsTool(deps({ getActiveOrganizationId: () => undefined }));

    await expect(spec.execute()).rejects.toThrow(/No organization is open/);
  });

  it('never returns the previous organization documents after a switch', async () => {
    let active: string | undefined = 'org-a';
    const spec = buildDocumentsTool(
      deps({
        getActiveOrganizationId: () => active,
        loadDocuments: async () => {
          active = 'org-b';
          return [document('doc-1')];
        },
      }),
    );

    await expect(spec.execute()).rejects.toThrow(/changed/);
  });
});

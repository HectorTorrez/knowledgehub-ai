import type {
  DocumentSummary,
  OrganizationSummary,
} from '@knowledgehub/shared-types';
import type { SessionState } from '~/lib/auth/session';
import type {
  WebMcpExecuteOptions,
  WebMcpToolDefinition,
  WebMcpToolExecute,
} from './types';

export interface WebMcpToolDeps {
  loadSession: (options?: WebMcpExecuteOptions) => Promise<SessionState>;
  loadOrganizations: (
    options?: WebMcpExecuteOptions,
  ) => Promise<OrganizationSummary[]>;
  loadDocuments: (
    organizationId: string,
    options?: WebMcpExecuteOptions,
  ) => Promise<DocumentSummary[]>;
  getActiveOrganizationId: () => string | undefined;
}

export interface WebMcpToolSpec {
  definition: WebMcpToolDefinition;
  execute: WebMcpToolExecute;
}

const ORGANIZATION_CHANGED_MESSAGE =
  'The open organization changed while this tool was running. Ask again for the current organization.';

export function buildSessionTool(deps: WebMcpToolDeps): WebMcpToolSpec {
  return {
    definition: {
      name: 'get_session',
      description:
        'Get the signed-in user and the organization currently open in the app.',
      annotations: { readOnlyHint: true },
    },
    execute: async (_input, options) => {
      const organizationId = deps.getActiveOrganizationId();
      const [session, organizations] = await Promise.all([
        deps.loadSession(options),
        deps.loadOrganizations(options),
      ]);

      assertOrganizationUnchanged(deps, organizationId);

      if (session.status !== 'authenticated') {
        throw new Error('No signed-in session is available.');
      }

      const active = findOrganization(organizations, organizationId);

      return {
        user: { id: session.user.id, email: session.user.email },
        activeOrganization: active === undefined ? null : projectOrganization(active),
      };
    },
  };
}

export function buildOrganizationsTool(deps: WebMcpToolDeps): WebMcpToolSpec {
  return {
    definition: {
      name: 'list_organizations',
      description: 'List the organizations the signed-in user belongs to.',
      annotations: { readOnlyHint: true },
    },
    execute: async (_input, options) => {
      const organizations = await deps.loadOrganizations(options);

      return { organizations: organizations.map(projectOrganization) };
    },
  };
}

export function buildDocumentsTool(deps: WebMcpToolDeps): WebMcpToolSpec {
  return {
    definition: {
      name: 'list_documents',
      description:
        'List the documents in the organization currently open in the app.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
    execute: async (_input, options) => {
      const organizationId = deps.getActiveOrganizationId();

      if (organizationId === undefined) {
        throw new Error('No organization is open in the app.');
      }

      const [documents, organizations] = await Promise.all([
        deps.loadDocuments(organizationId, options),
        deps.loadOrganizations(options),
      ]);

      assertOrganizationUnchanged(deps, organizationId);

      const organization = findOrganization(organizations, organizationId);

      return {
        organizationId,
        organizationName: organization?.name ?? null,
        documents: documents.map((document) => ({
          id: document.id,
          title: document.title,
          status: document.status,
          failureKind: document.failureKind,
        })),
      };
    },
  };
}

function assertOrganizationUnchanged(
  deps: WebMcpToolDeps,
  expected: string | undefined,
): void {
  if (deps.getActiveOrganizationId() !== expected) {
    throw new Error(ORGANIZATION_CHANGED_MESSAGE);
  }
}

function findOrganization(
  organizations: OrganizationSummary[],
  organizationId: string | undefined,
): OrganizationSummary | undefined {
  return organizations.find((organization) => organization.id === organizationId);
}

function projectOrganization(organization: OrganizationSummary) {
  return {
    id: organization.id,
    name: organization.name,
    role: organization.role,
  };
}

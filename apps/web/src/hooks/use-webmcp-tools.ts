import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useSession } from '~/hooks/use-auth';
import { useWebMcpTool } from '~/hooks/use-webmcp-tool';
import { documentsApi } from '~/lib/api/documents';
import { organizationsApi } from '~/lib/api/organizations';
import { sessionQuery } from '~/lib/auth/session';
import {
  buildDocumentsTool,
  buildOrganizationsTool,
  buildSessionTool,
  type WebMcpToolDeps,
} from '~/lib/webmcp/tools';
import type { WebMcpToolExecute } from '~/lib/webmcp/types';

interface RouterMatchLike {
  params?: { organizationId?: unknown };
}

const NOOP_EXECUTE: WebMcpToolExecute = async () => undefined;

export function readActiveOrganizationId(
  matches: readonly RouterMatchLike[],
): string | undefined {
  for (const match of matches) {
    const organizationId = match.params?.organizationId;

    if (typeof organizationId === 'string') {
      return organizationId;
    }
  }

  return undefined;
}

export function useWebMcpTools(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();

  const activeOrganizationId = useRouterState({
    select: (state) => readActiveOrganizationId(state.matches),
  });

  const deps = useMemo<WebMcpToolDeps>(
    () => ({
      loadSession: () => queryClient.fetchQuery(sessionQuery),
      loadOrganizations: async (options) =>
        (await organizationsApi.list({ signal: options?.signal })).organizations,
      loadDocuments: async (organizationId, options) =>
        (
          await documentsApi.list(organizationId, { signal: options?.signal })
        ).documents,
      getActiveOrganizationId: () =>
        readActiveOrganizationId(router.state.matches),
    }),
    [queryClient, router],
  );

  const authenticated = session.data?.status === 'authenticated';

  const sessionTool = useMemo(
    () => (authenticated ? buildSessionTool(deps) : null),
    [authenticated, deps],
  );
  const organizationsTool = useMemo(
    () => (authenticated ? buildOrganizationsTool(deps) : null),
    [authenticated, deps],
  );
  const documentsTool = useMemo(
    () =>
      authenticated && activeOrganizationId !== undefined
        ? buildDocumentsTool(deps)
        : null,
    [authenticated, activeOrganizationId, deps],
  );

  useWebMcpTool(sessionTool?.definition ?? null, sessionTool?.execute ?? NOOP_EXECUTE);
  useWebMcpTool(
    organizationsTool?.definition ?? null,
    organizationsTool?.execute ?? NOOP_EXECUTE,
  );
  useWebMcpTool(
    documentsTool?.definition ?? null,
    documentsTool?.execute ?? NOOP_EXECUTE,
  );
}

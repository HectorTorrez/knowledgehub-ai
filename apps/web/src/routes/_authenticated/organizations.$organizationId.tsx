import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId',
)({
  component: OrganizationLayout,
});

function OrganizationLayout() {
  const { organizationId } = Route.useParams();
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {organization.data?.organization.name ?? 'Organization'}
        </h1>
        <Link to="/organizations" className="text-sm text-muted-foreground underline">
          All organizations
        </Link>
      </div>

      {organization.isError ? <ErrorNotice error={organization.error} /> : null}

      <nav className="flex gap-4 border-b text-sm">
        <OrganizationTab to="/organizations/$organizationId" exact>
          Overview
        </OrganizationTab>
        <OrganizationTab to="/organizations/$organizationId/documents">
          Documents
        </OrganizationTab>
        <OrganizationTab to="/organizations/$organizationId/ask">
          Ask
        </OrganizationTab>
      </nav>

      <Outlet />
    </div>
  );
}

function OrganizationTab({
  to,
  exact,
  children,
}: Readonly<{
  to:
    | '/organizations/$organizationId'
    | '/organizations/$organizationId/documents'
    | '/organizations/$organizationId/ask';
  exact?: boolean;
  children: ReactNode;
}>) {
  const { organizationId } = Route.useParams();

  return (
    <Link
      to={to}
      params={{ organizationId }}
      activeOptions={{ exact: exact ?? false }}
      className="pb-2 text-muted-foreground hover:text-foreground"
      activeProps={{ className: 'border-b-2 border-primary font-medium text-foreground' }}
    >
      {children}
    </Link>
  );
}

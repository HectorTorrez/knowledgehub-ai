import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { ArrowLeft, FileText, LayoutGrid, MessageSquareText, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { Skeleton } from '~/components/ui/skeleton';
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
      <div className="space-y-1">
        <Link
          to="/organizations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All organizations
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization.isPending ? (
            <Skeleton className="h-8 w-56" />
          ) : (
            (organization.data?.organization.name ?? 'Organization')
          )}
        </h1>
      </div>

      {organization.isError ? <ErrorNotice error={organization.error} /> : null}

      <nav className="flex gap-1 border-b">
        <OrganizationTab to="/organizations/$organizationId" exact icon={LayoutGrid}>
          Overview
        </OrganizationTab>
        <OrganizationTab to="/organizations/$organizationId/documents" icon={FileText}>
          Documents
        </OrganizationTab>
        <OrganizationTab to="/organizations/$organizationId/ask" icon={MessageSquareText}>
          Ask
        </OrganizationTab>
        <OrganizationTab to="/organizations/$organizationId/search" icon={Search}>
          Search
        </OrganizationTab>
      </nav>

      <Outlet />
    </div>
  );
}

function OrganizationTab({
  to,
  exact,
  icon: Icon,
  children,
}: Readonly<{
  to:
    | '/organizations/$organizationId'
    | '/organizations/$organizationId/documents'
    | '/organizations/$organizationId/ask'
    | '/organizations/$organizationId/search';
  exact?: boolean;
  icon: typeof LayoutGrid;
  children: ReactNode;
}>) {
  const { organizationId } = Route.useParams();

  return (
    <Link
      to={to}
      params={{ organizationId }}
      activeOptions={{ exact: exact ?? false }}
      className="inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
      inactiveProps={{
        className: 'border-transparent text-muted-foreground hover:text-foreground',
      }}
      activeProps={{ className: 'border-primary text-foreground' }}
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}

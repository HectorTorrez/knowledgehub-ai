import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import {
  FileText,
  LayoutGrid,
  MessageSquareText,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { ErrorNotice } from '~/components/route-states';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId',
)({
  component: OrganizationLayout,
});

type OrganizationTabPath =
  | '/organizations/$organizationId'
  | '/organizations/$organizationId/documents'
  | '/organizations/$organizationId/ask'
  | '/organizations/$organizationId/search'
  | '/organizations/$organizationId/settings';

interface OrganizationTabItem {
  to: OrganizationTabPath;
  exact?: boolean;
  icon: LucideIcon;
  label: string;
}

const ORGANIZATION_TABS: ReadonlyArray<OrganizationTabItem> = [
  {
    to: '/organizations/$organizationId',
    exact: true,
    icon: LayoutGrid,
    label: 'Overview',
  },
  {
    to: '/organizations/$organizationId/documents',
    icon: FileText,
    label: 'Documents',
  },
  {
    to: '/organizations/$organizationId/ask',
    icon: MessageSquareText,
    label: 'Ask',
  },
  {
    to: '/organizations/$organizationId/search',
    icon: Search,
    label: 'Search',
  },
  {
    to: '/organizations/$organizationId/settings',
    icon: Settings,
    label: 'Settings',
  },
];

function OrganizationLayout() {
  const { organizationId } = Route.useParams();
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });

  return (
    <div className="space-y-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0">
      {organization.isError ? (
        <ErrorNotice
          error={organization.error}
          onRetry={() => void organization.refetch()}
        />
      ) : null}

      <nav
        aria-label="Organization sections"
        className="hidden gap-1 overflow-x-auto border-b sm:flex"
      >
        {ORGANIZATION_TABS.map((tab) => (
          <OrganizationTab key={tab.to} {...tab} />
        ))}
      </nav>

      <Outlet />

      <nav
        aria-label="Organization sections"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden"
      >
        {ORGANIZATION_TABS.map(({ icon: Icon, ...tab }) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ organizationId }}
            activeOptions={{ exact: tab.exact ?? false }}
            className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[0.6875rem] font-medium transition-colors active:bg-accent/60"
            inactiveProps={{ className: 'text-muted-foreground' }}
            activeProps={{
              className: 'rounded-xl bg-primary/10 text-primary',
              'aria-current': 'page',
            }}
          >
            <Icon className="size-5" />
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function OrganizationTab({ to, exact, icon: Icon, label }: OrganizationTabItem) {
  const { organizationId } = Route.useParams();

  return (
    <Link
      to={to}
      params={{ organizationId }}
      activeOptions={{ exact: exact ?? false }}
      className="-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
      inactiveProps={{
        className: 'border-transparent text-muted-foreground hover:text-foreground',
      }}
      activeProps={{
        className: 'border-brand text-brand',
        'aria-current': 'page',
      }}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

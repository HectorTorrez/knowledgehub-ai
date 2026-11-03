import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import {
  BarChart3,
  FileText,
  LayoutGrid,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { ErrorNotice } from '~/components/route-states';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { cn } from '~/lib/utils';

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
  | '/organizations/$organizationId/settings'
  | '/organizations/$organizationId/insights';

interface OrganizationTabItem {
  to: OrganizationTabPath;
  ownerOnly?: boolean;
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
  { to: '/organizations/$organizationId/insights', icon: BarChart3, label: 'Insights', ownerOnly: true },
  {
    to: '/organizations/$organizationId/settings',
    icon: Settings,
    label: 'Settings',
  },
];

const PRIMARY_MOBILE_TAB_COUNT = 4;

const MOBILE_TAB_CLASSNAME =
  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[0.6875rem] font-medium transition-colors active:bg-accent/60';

function OrganizationLayout() {
  const { organizationId } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const moreActive = /\/(settings|insights)(?:\/|$)/.test(pathname);
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });

  const tabs = ORGANIZATION_TABS.filter((tab) => !tab.ownerOnly || organization.data?.organization.role === 'OWNER');

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
        {tabs.map((tab) => (
          <OrganizationTab key={tab.to} {...tab} />
        ))}
      </nav>

      <Outlet />

      <nav
        aria-label="Organization sections"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col auto-cols-fr border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden"
      >
        {tabs.slice(0, PRIMARY_MOBILE_TAB_COUNT).map(({ icon: Icon, ...tab }) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ organizationId }}
            activeOptions={{ exact: tab.exact ?? false }}
            className={MOBILE_TAB_CLASSNAME}
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
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              MOBILE_TAB_CLASSNAME,
              'rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
              moreActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className="size-5" />
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-40">
            {tabs.slice(PRIMARY_MOBILE_TAB_COUNT).map(({ icon: Icon, ...tab }) => (
              <DropdownMenuItem key={tab.to} asChild>
                <Link
                  to={tab.to}
                  params={{ organizationId }}
                  activeProps={{
                    'aria-current': 'page',
                    className: 'bg-primary/10 text-primary',
                  }}
                >
                  <Icon />
                  {tab.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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

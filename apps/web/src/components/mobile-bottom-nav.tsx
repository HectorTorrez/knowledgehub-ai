import { Link, useRouterState } from '@tanstack/react-router';
import {
  FileText,
  LayoutGrid,
  Menu,
  MessageSquareText,
  Search,
} from 'lucide-react';
import { useSidebar } from '~/components/ui/sidebar';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const ITEMS = [
  {
    to: '/organizations/$organizationId',
    label: 'nav.overview',
    icon: LayoutGrid,
    exact: true,
  },
  {
    to: '/organizations/$organizationId/documents',
    label: 'nav.documents',
    icon: FileText,
    exact: false,
  },
  {
    to: '/organizations/$organizationId/ask',
    label: 'nav.ask',
    icon: MessageSquareText,
    exact: false,
  },
  {
    to: '/organizations/$organizationId/search',
    label: 'nav.search',
    icon: Search,
    exact: false,
  },
] as const;

const itemClass =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function MobileBottomNav({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const t = useT();
  const { setOpenMobile } = useSidebar();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <nav
      aria-label={t('nav.mobileNavigation')}
      data-mobile-bottom-nav=""
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden print:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch gap-1 px-2 py-1.5">
        {ITEMS.map(({ to, label, icon: Icon, exact }) => {
          const href = to.replace('$organizationId', organizationId);
          const active = exact
            ? pathname === href || pathname === `${href}/`
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={to}
              to={to}
              params={{ organizationId }}
              aria-current={active ? 'page' : undefined}
              className={cn(itemClass, active && 'bg-brand/10 text-brand')}
            >
              <Icon className="size-5" />
              <span className="truncate">{t(label)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={itemClass}
          onClick={() => setOpenMobile(true)}
        >
          <Menu className="size-5" />
          <span className="truncate">{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  );
}

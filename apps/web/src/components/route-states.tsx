import { AlertCircle } from 'lucide-react';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useT } from '~/lib/i18n/hooks';

const SIDEBAR_ITEM_WIDTHS = [
  'w-24',
  'w-28',
  'w-16',
  'w-20',
  'w-24',
  'w-20',
  'w-16',
];

export function RoutePending() {
  const t = useT();

  return (
    <div role="status" aria-label={t('states.loading')}>
      <PageSkeleton />
    </div>
  );
}

export function AppShellPending() {
  const t = useT();

  return (
    <div
      role="status"
      aria-label={t('states.loading')}
      className="flex min-h-svh w-full"
    >
      <aside className="hidden w-64 shrink-0 flex-col gap-2 border-r bg-sidebar p-2 md:flex">
        <div className="flex h-12 items-center gap-2 px-2">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <Skeleton className="mb-2 h-3 w-20" />
          {SIDEBAR_ITEM_WIDTHS.map((width, index) => (
            <div key={index} className="flex h-8 items-center gap-2 px-2">
              <Skeleton className="size-4" />
              <Skeleton className={`h-4 ${width}`} />
            </div>
          ))}
        </div>
        <div className="mt-auto flex h-12 items-center gap-2 px-2">
          <Skeleton className="size-8" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex h-14 items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] sm:px-6">
          <Skeleton className="size-7" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function RouteError({
  title,
  description,
  onRetry,
}: Readonly<{ title?: string; description?: string; onRetry: () => void }>) {
  const t = useT();

  return (
    <EmptyState
      icon={AlertCircle}
      title={title ?? t('states.unableToLoad')}
      description={description ?? t('states.pleaseRetry')}
      action={<Button onClick={onRetry}>{t('states.retry')}</Button>}
    />
  );
}

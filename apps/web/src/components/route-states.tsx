import { AlertCircle } from 'lucide-react';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useT } from '~/lib/i18n/provider';

export function RoutePending() {
  const t = useT();

  return (
    <div
      role="status"
      aria-label={t('states.loading')}
      className="space-y-6 p-6"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
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

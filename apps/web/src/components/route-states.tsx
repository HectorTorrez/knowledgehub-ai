import { AlertCircle } from 'lucide-react';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';

export function RoutePending() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6 p-6">
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
  title = 'Unable to load',
  description = 'Please try again.',
  onRetry,
}: Readonly<{ title?: string; description?: string; onRetry: () => void }>) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description={description}
      action={<Button onClick={onRetry}>Retry</Button>}
    />
  );
}

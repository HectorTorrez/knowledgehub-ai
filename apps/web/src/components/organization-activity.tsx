import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
import { formatActivity } from '~/lib/activity-format';
import { activityApi } from '~/lib/api/activity';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';

const ACTIVITY_PAGE_SIZE = 10;

export function OrganizationActivity({
  organizationId,
}: {
  organizationId: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [pageIndex, setPageIndex] = useState(0);
  const activity = useInfiniteQuery({
    queryKey: [
      'organizations',
      organizationId,
      'activity',
      { limit: ACTIVITY_PAGE_SIZE },
    ],
    queryFn: ({ pageParam }) =>
      activityApi.list(organizationId, {
        cursor: pageParam,
        limit: ACTIVITY_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  useQueryErrorToast(activity.error, () => void activity.refetch());

  const pages = activity.data?.pages ?? [];
  const currentIndex = Math.min(pageIndex, Math.max(pages.length - 1, 0));
  const currentPage = pages[currentIndex];
  const hasPreviousPage = currentIndex > 0;
  const hasLoadedNextPage = currentIndex < pages.length - 1;
  const hasNextPage = hasLoadedNextPage || activity.hasNextPage;

  async function goToNextPage() {
    if (!hasLoadedNextPage) {
      const result = await activity.fetchNextPage();
      if (result.isError) return;
    }
    setPageIndex(currentIndex + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('orgSettings.activity')}</CardTitle>
        <CardDescription>
          {t('orgSettings.activityDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activity.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : activity.isError && !currentPage ? (
          <RouteError
            title={t('orgSettings.activityLoadError')}
            onRetry={() => void activity.refetch()}
          />
        ) : !currentPage || currentPage.activities.length === 0 ? (
          <EmptyState icon={History} title={t('orgSettings.noActivity')} />
        ) : (
          <ul className="space-y-4">
            {currentPage.activities.map((item) => (
              <li key={item.id} className="text-sm">
                <p>{formatActivity(item, t)}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(item.createdAt, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {hasPreviousPage || hasNextPage ? (
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPreviousPage || activity.isFetchingNextPage}
              onClick={() => setPageIndex(currentIndex - 1)}
            >
              <ChevronLeft />
              {t('orgSettings.activityPreviousPage')}
            </Button>
            <span
              className="text-sm tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {activity.isFetchingNextPage
                ? t('orgSettings.loading')
                : t('orgSettings.activityPage', { page: currentIndex + 1 })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNextPage || activity.isFetchingNextPage}
              onClick={() => void goToNextPage()}
            >
              {t('orgSettings.activityNextPage')}
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

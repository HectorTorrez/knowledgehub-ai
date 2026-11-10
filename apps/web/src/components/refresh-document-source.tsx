import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { useReportError } from '~/hooks/use-error-toast';
import { Button } from './ui/button';

export function RefreshDocumentSource({
  organizationId,
  documentId,
  checkedAt,
  canRefresh,
}: {
  organizationId: string;
  documentId: string;
  checkedAt?: string | null;
  canRefresh: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const reportError = useReportError();
  const refresh = useMutation({
    mutationFn: () => documentsApi.refreshUrl(organizationId, documentId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.detail(
            organizationId,
            documentId,
          ),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.list(organizationId),
        }),
        client.invalidateQueries({
          queryKey: ['document-versions', organizationId, documentId],
        }),
      ]),
    onError: (error) => reportError(error),
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-xs text-muted-foreground">
        {checkedAt
          ? t('sourceRefresh.checked', {
              date: formatDateTime(checkedAt, locale),
            })
          : t('sourceRefresh.never')}
      </p>
      {canRefresh ? (
        <Button
          variant="outline"
          size="sm"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending
            ? t('sourceRefresh.checking')
            : t('sourceRefresh.check')}
        </Button>
      ) : null}
      {refresh.isSuccess ? (
        <p role="status" className="text-sm">
          {refresh.data.changed
            ? t('sourceRefresh.updated')
            : t('sourceRefresh.unchanged')}
        </p>
      ) : null}
    </div>
  );
}

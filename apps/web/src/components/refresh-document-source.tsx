import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { useReportError } from '~/hooks/use-error-toast';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { DocumentDetailSection } from './document-detail-section';
import { Button } from './ui/button';

export function RefreshDocumentSource({
  organizationId,
  documentId,
  sourceUrl,
  checkedAt,
  canRefresh,
}: {
  organizationId: string;
  documentId: string;
  sourceUrl: string;
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
    <DocumentDetailSection title={t('documentDetail.source')}>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        <span className="truncate">{new URL(sourceUrl).hostname}</span>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
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
          className="w-full"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw />
          {refresh.isPending
            ? t('sourceRefresh.checking')
            : t('sourceRefresh.check')}
        </Button>
      ) : null}
      {refresh.isSuccess ? (
        <p role="status" className="text-xs">
          {refresh.data.changed
            ? t('sourceRefresh.updated')
            : t('sourceRefresh.unchanged')}
        </p>
      ) : null}
    </DocumentDetailSection>
  );
}

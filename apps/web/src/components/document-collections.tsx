import type {
  DocumentDetailResponse,
  DocumentSummary,
} from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CollectionBadges } from '~/components/collections-manager';
import { DocumentDetailSection } from '~/components/document-detail-section';
import { DocumentMultiSelect } from '~/components/document-multi-select';
import { useReportError } from '~/hooks/use-error-toast';
import { collectionsApi } from '~/lib/api/collections';
import { queryKeys } from '~/lib/api/query-keys';
import { useT } from '~/lib/i18n/hooks';

export function DocumentCollections({
  organizationId,
  document,
  canWrite,
}: Readonly<{
  organizationId: string;
  document: DocumentSummary;
  canWrite: boolean;
}>) {
  const t = useT();
  const client = useQueryClient();
  const reportError = useReportError();
  const detailKey = queryKeys.organizations.documents.detail(
    organizationId,
    document.id,
  );
  const collections = useQuery({
    queryKey: queryKeys.organizations.collections(organizationId),
    queryFn: () => collectionsApi.list(organizationId),
    enabled: canWrite,
  });
  const assignment = useMutation({
    mutationFn: (ids: string[]) =>
      collectionsApi.setDocumentCollections(organizationId, document.id, ids),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: detailKey });
      const previous = client.getQueryData<DocumentDetailResponse>(detailKey);
      client.setQueryData<DocumentDetailResponse>(detailKey, (current) =>
        current
          ? {
              ...current,
              document: {
                ...current.document,
                collections: (collections.data ?? []).filter((item) =>
                  ids.includes(item.id),
                ),
              },
            }
          : current,
      );
      return { previous };
    },
    onError: (error, _ids, context) => {
      client.setQueryData(detailKey, context?.previous);
      reportError(error);
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.all(organizationId),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.collections(organizationId),
        }),
      ]),
  });
  const assigned = document.collections ?? [];

  if (!canWrite) {
    return (
      <DocumentDetailSection title={t('search.collections')}>
        {assigned.length > 0 ? (
          <CollectionBadges collections={assigned} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('documentDetail.noCollections')}
          </p>
        )}
      </DocumentDetailSection>
    );
  }

  return (
    <DocumentDetailSection>
      <DocumentMultiSelect
        className="sm:w-full"
        disabled={assignment.isPending}
        label={t('search.collections')}
        emptyLabel={t('documentDetail.noCollections')}
        documents={(collections.data ?? []).map((item) => ({
          id: item.id,
          title: item.name,
        }))}
        selectedIds={assigned.map((item) => item.id)}
        onChange={(ids) => assignment.mutate(ids)}
      />
      {assigned.length > 1 ? <CollectionBadges collections={assigned} /> : null}
    </DocumentDetailSection>
  );
}

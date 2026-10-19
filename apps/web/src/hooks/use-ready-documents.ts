import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { readyDocuments } from '~/lib/document-scope';

const READY_DOCUMENTS_LIMIT = 100;

export function useReadyDocuments(organizationId: string) {
  const query = useQuery({
    queryKey: queryKeys.organizations.documents.ready(organizationId),
    queryFn: () =>
      documentsApi.list(organizationId, { limit: READY_DOCUMENTS_LIMIT }),
  });

  return {
    query,
    documents: readyDocuments(query.data?.documents ?? []),
  };
}

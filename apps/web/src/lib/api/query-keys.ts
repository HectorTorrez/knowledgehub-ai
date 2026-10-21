import type { DocumentStatus } from '@knowledgehub/shared-types';

interface DocumentListFilters {
  q?: string;
  status?: DocumentStatus;
  order?: 'createdAt_desc' | 'createdAt_asc';
}

function documentsListKey(
  organizationId: string,
  filters: DocumentListFilters,
) {
  const base = [
    'organizations',
    organizationId,
    'documents',
    'list',
  ] as const;

  if (Object.values(filters).every((value) => value === undefined)) {
    return base;
  }

  return [
    ...base,
    filters.q ?? '',
    filters.status ?? '',
    filters.order ?? 'createdAt_desc',
  ] as const;
}

export const queryKeys = {
  organizations: {
    all: ['organizations'] as const,
    list: () => ['organizations', 'list'] as const,
    detail: (organizationId: string) =>
      ['organizations', organizationId, 'detail'] as const,
    members: (organizationId: string) =>
      ['organizations', organizationId, 'members'] as const,
    usage: (organizationId: string) =>
      ['organizations', organizationId, 'usage'] as const,
    invitations: {
      list: (organizationId: string) =>
        ['organizations', organizationId, 'invitations', 'list'] as const,
    },
    documents: {
      all: (organizationId: string) =>
        ['organizations', organizationId, 'documents'] as const,
      list: (organizationId: string, filters: DocumentListFilters = {}) =>
        documentsListKey(organizationId, filters),
      ready: (organizationId: string) =>
        ['organizations', organizationId, 'documents', 'list', 'ready'] as const,
      detail: (organizationId: string, documentId: string) =>
        ['organizations', organizationId, 'documents', 'detail', documentId] as const,
    },
    conversations: {
      all: (organizationId: string) =>
        ['organizations', organizationId, 'conversations'] as const,
      list: (organizationId: string) =>
        ['organizations', organizationId, 'conversations', 'list'] as const,
      detail: (organizationId: string, conversationId: string) =>
        [
          'organizations',
          organizationId,
          'conversations',
          'detail',
          conversationId,
        ] as const,
    },
    answers: {
      list: (
        organizationId: string,
        conversationId?: string,
        askedBy?: 'me' | 'organization',
      ) =>
        conversationId === undefined
          ? ([
              'organizations',
              organizationId,
              'answers',
              'list',
              askedBy ?? '',
            ] as const)
          : ([
              'organizations',
              organizationId,
              'answers',
              'list',
              'conversation',
              conversationId,
              askedBy ?? '',
            ] as const),
      detail: (organizationId: string, answerId: string) =>
        ['organizations', organizationId, 'answers', 'detail', answerId] as const,
    },
    search: (
      organizationId: string,
      query: string | null,
      documentId?: string,
    ) =>
      [
        'organizations',
        organizationId,
        'search',
        query ?? '',
        documentId ?? '',
      ] as const,
    aggregates: {
      contractTotals: (organizationId: string, documentId: string) =>
        [
          'organizations',
          organizationId,
          'aggregates',
          'contract-totals',
          documentId,
        ] as const,
    },
  },
};

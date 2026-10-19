import type { DocumentStatus } from '@knowledgehub/shared-types';

export const queryKeys = {
  organizations: {
    all: ['organizations'] as const,
    list: () => ['organizations', 'list'] as const,
    detail: (organizationId: string) =>
      ['organizations', organizationId, 'detail'] as const,
    members: (organizationId: string) =>
      ['organizations', organizationId, 'members'] as const,
    documents: {
      list: (
        organizationId: string,
        filters: {
          q?: string;
          status?: DocumentStatus;
          order?: 'createdAt_desc' | 'createdAt_asc';
        } = {},
      ) =>
        [
          'organizations',
          organizationId,
          'documents',
          'list',
          filters.q ?? '',
          filters.status ?? '',
          filters.order ?? 'createdAt_desc',
        ] as const,
      detail: (organizationId: string, documentId: string) =>
        ['organizations', organizationId, 'documents', 'detail', documentId] as const,
    },
    answers: {
      list: (organizationId: string) =>
        ['organizations', organizationId, 'answers', 'list'] as const,
      detail: (organizationId: string, answerId: string) =>
        ['organizations', organizationId, 'answers', 'detail', answerId] as const,
    },
    search: (organizationId: string, query: string | null) =>
      ['organizations', organizationId, 'search', query ?? ''] as const,
  },
};

export const queryKeys = {
  organizations: {
    all: ['organizations'] as const,
    list: () => ['organizations', 'list'] as const,
    detail: (organizationId: string) =>
      ['organizations', organizationId, 'detail'] as const,
    members: (organizationId: string) =>
      ['organizations', organizationId, 'members'] as const,
    documents: {
      list: (organizationId: string) =>
        ['organizations', organizationId, 'documents', 'list'] as const,
      detail: (organizationId: string, documentId: string) =>
        ['organizations', organizationId, 'documents', 'detail', documentId] as const,
    },
  },
};

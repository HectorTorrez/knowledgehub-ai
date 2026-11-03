import type {
  ConversationDetailResponse,
  ConversationListResponse,
} from '@knowledgehub/shared-types';
import { apiFetch, apiStream, type RequestOptions } from './client';

export interface ListConversationsOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
}

function conversationsPath(organizationId: string): string {
  return `/organizations/${organizationId}/conversations`;
}

export const conversationsApi = {
  create(organizationId: string): Promise<ConversationDetailResponse> {
    return apiFetch<ConversationDetailResponse>(
      conversationsPath(organizationId),
      { method: 'POST', authRecovery: true },
    );
  },

  list(
    organizationId: string,
    options: ListConversationsOptions = {},
  ): Promise<ConversationListResponse> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.cursor) {
      params.set('cursor', options.cursor);
    }

    const query = params.toString();
    return apiFetch<ConversationListResponse>(
      `${conversationsPath(organizationId)}${query ? `?${query}` : ''}`,
      { authRecovery: true, signal: options.signal },
    );
  },

  detail(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponse> {
    return apiFetch<ConversationDetailResponse>(
      `${conversationsPath(organizationId)}/${conversationId}`,
      { authRecovery: true },
    );
  },

  async export(organizationId: string, conversationId: string): Promise<void> {
    const response = await apiStream(
      `${conversationsPath(organizationId)}/${conversationId}/export`,
      {
        method: 'GET',
        headers: { Accept: 'text/markdown' },
      },
    );
    const blob = await response.blob();
    const filename =
      response.headers
        .get('Content-Disposition')
        ?.match(/filename="([a-zA-Z0-9.-]+)"/)?.[1] ?? 'conversation.md';
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  remove(organizationId: string, conversationId: string): Promise<void> {
    return apiFetch<void>(
      `${conversationsPath(organizationId)}/${conversationId}`,
      { method: 'DELETE', authRecovery: true },
    );
  },
};

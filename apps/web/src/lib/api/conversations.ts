import type {
  ConversationDetailResponse,
  ConversationListResponse,
} from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

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

  remove(organizationId: string, conversationId: string): Promise<void> {
    return apiFetch<void>(
      `${conversationsPath(organizationId)}/${conversationId}`,
      { method: 'DELETE', authRecovery: true },
    );
  },
};

import type {
  AnswerDetailResponse,
  AnswerFeedbackResponse,
  AnswerListResponse,
  AnswerRequest,
  AnswerResponse,
  AnswerStreamEvent,
  SetAnswerFeedbackRequest,
} from '@knowledgehub/shared-types';
import { apiFetch, apiStream, type RequestOptions } from './client';

export interface ListAnswersOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
  conversationId?: string;
  askedBy?: 'me' | 'organization';
}

export const answersApi = {
  ask(
    organizationId: string,
    question: string,
    documentId?: string,
    conversationId?: string,
  ): Promise<AnswerResponse> {
    const body: AnswerRequest = {
      question,
      ...(documentId ? { documentId } : {}),
      ...(conversationId ? { conversationId } : {}),
    };

    return apiFetch<AnswerResponse>(
      `/organizations/${organizationId}/answers`,
      { method: 'POST', body, authRecovery: true },
    );
  },

  list(
    organizationId: string,
    options: ListAnswersOptions = {},
  ): Promise<AnswerListResponse> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.cursor) {
      params.set('cursor', options.cursor);
    }
    if (options.conversationId) {
      params.set('conversationId', options.conversationId);
    }
    if (options.askedBy) {
      params.set('askedBy', options.askedBy);
    }

    const query = params.toString();
    return apiFetch<AnswerListResponse>(
      `/organizations/${organizationId}/answers${query ? `?${query}` : ''}`,
      { authRecovery: true, signal: options.signal },
    );
  },

  detail(
    organizationId: string,
    answerId: string,
  ): Promise<AnswerDetailResponse> {
    return apiFetch<AnswerDetailResponse>(
      `/organizations/${organizationId}/answers/${answerId}`,
      { authRecovery: true },
    );
  },

  remove(organizationId: string, answerId: string): Promise<void> {
    return apiFetch<void>(`/organizations/${organizationId}/answers/${answerId}`, {
      method: 'DELETE',
      authRecovery: true,
    });
  },

  setFeedback(
    organizationId: string,
    answerId: string,
    input: SetAnswerFeedbackRequest,
  ): Promise<AnswerFeedbackResponse> {
    return apiFetch<AnswerFeedbackResponse>(
      `/organizations/${organizationId}/answers/${answerId}/feedback`,
      { method: 'PUT', body: input, authRecovery: true },
    );
  },

  clearFeedback(organizationId: string, answerId: string): Promise<void> {
    return apiFetch<void>(
      `/organizations/${organizationId}/answers/${answerId}/feedback`,
      { method: 'DELETE', authRecovery: true },
    );
  },
};

export async function streamAnswer(
  organizationId: string,
  question: string,
  documentId: string | undefined,
  conversationId: string | undefined,
  onEvent: (event: AnswerStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const body: AnswerRequest = {
    question,
    stream: true,
    ...(documentId ? { documentId } : {}),
    ...(conversationId ? { conversationId } : {}),
  };

  const response = await apiStream(`/organizations/${organizationId}/answers`, {
    method: 'POST',
    body,
    signal,
  });

  await consumeNdjson(response.body, onEvent);
}

async function consumeNdjson(
  body: ReadableStream<Uint8Array> | null,
  onEvent: (event: AnswerStreamEvent) => void,
): Promise<void> {
  if (body === null) {
    throw new Error('The streamed response had no body.');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          onEvent(JSON.parse(line) as AnswerStreamEvent);
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

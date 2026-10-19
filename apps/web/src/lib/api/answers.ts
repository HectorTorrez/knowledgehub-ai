import type {
  AnswerDetailResponse,
  AnswerListResponse,
  AnswerRequest,
  AnswerResponse,
  AnswerStreamEvent,
} from '@knowledgehub/shared-types';
import { apiFetch, apiStream, type RequestOptions } from './client';

export interface ListAnswersOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
}

export const answersApi = {
  ask(organizationId: string, question: string): Promise<AnswerResponse> {
    const body: AnswerRequest = { question };

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
};

export async function streamAnswer(
  organizationId: string,
  question: string,
  onEvent: (event: AnswerStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiStream(
    `/organizations/${organizationId}/answers`,
    {
      method: 'POST',
      body: { question, stream: true },
      signal,
    },
  );

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
}

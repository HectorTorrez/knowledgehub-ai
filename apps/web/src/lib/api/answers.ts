import type {
  AnswerDetailResponse,
  AnswerListResponse,
  AnswerRequest,
  AnswerResponse,
} from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

export interface AskedQuestion {
  organizationId: string;
  question: string;
}

export interface ListAnswersOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
}

export function answerFor(
  request: AskedQuestion | undefined,
  answer: AnswerResponse | undefined,
  organizationId: string,
): AnswerResponse | undefined {
  return request?.organizationId === organizationId ? answer : undefined;
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

import type { AnswerRequest, AnswerResponse } from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export interface AskedQuestion {
  organizationId: string;
  question: string;
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
};

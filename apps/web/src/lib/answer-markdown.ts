import type { AnswerCitation, AnswerResponse } from '@knowledgehub/shared-types';

export interface AnswerMarkdownInput {
  question: string;
  answer: string | null;
  status: AnswerResponse['status'];
  citations: AnswerCitation[];
}

export function buildAnswerMarkdown({
  question,
  answer,
  status,
  citations,
}: AnswerMarkdownInput): string {
  const parts = [`## ${question}`, ''];

  if (status === 'answered' && answer !== null) {
    parts.push(answer, '');
  } else {
    parts.push(
      'The documents available did not contain enough evidence to answer this question.',
      '',
    );
  }

  if (citations.length > 0) {
    parts.push('### Sources', '');

    for (const citation of citations) {
      parts.push(
        `${citation.marker}. ${citation.documentTitle} — page ${citation.pageNumber}: ${citation.excerpt}`,
      );
    }

    parts.push('');
  }

  return parts.join('\n').trimEnd();
}

export function answerPermalink(
  origin: string,
  organizationId: string,
  answerId: string,
): string {
  return `${origin}/organizations/${organizationId}/ask?answer=${encodeURIComponent(
    answerId,
  )}`;
}

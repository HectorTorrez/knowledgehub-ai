import type {
  AnswerCitation,
  AnswerResponse,
} from '@knowledgehub/shared-types';
import type { Translator } from '~/lib/i18n/translate';

export interface AnswerMarkdownInput {
  question: string;
  answer: string | null;
  status: AnswerResponse['status'];
  citations: AnswerCitation[];
  missing?: string[];
}

export function buildAnswerMarkdown(
  { question, answer, status, citations, missing = [] }: AnswerMarkdownInput,
  t: Translator,
): string {
  const parts = [`## ${question}`, ''];

  if (status !== 'insufficient_evidence' && answer !== null) {
    parts.push(answer, '');
  } else {
    parts.push(t('answer.markdownNotEnough'), '');
  }

  if (status === 'partial') {
    parts.push(
      `### ${t('answer.missingInfo')}`,
      '',
      ...missing.map((item) => `- ${item}`),
      '',
    );
  }

  if (citations.length > 0) {
    parts.push(`### ${t('answer.sources')}`, '');

    for (const citation of citations) {
      parts.push(
        t('answer.citationLine', {
          marker: citation.marker,
          title: citation.documentTitle,
          page: citation.pageNumber,
          excerpt: citation.excerpt,
        }),
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

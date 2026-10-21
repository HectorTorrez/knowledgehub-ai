import { describe, expect, it } from 'vitest';
import { answerPermalink, buildAnswerMarkdown } from './answer-markdown';

const CITATION = {
  marker: 1,
  documentId: 'doc-1',
  documentTitle: 'Handbook',
  pageNumber: 3,
  chunkIndex: 2,
  excerpt: 'Employees get 20 days of leave.',
};

describe('buildAnswerMarkdown', () => {
  it('renders the question, answer, and sources', () => {
    const markdown = buildAnswerMarkdown({
      question: 'How much leave?',
      answer: 'You get 20 days [1].',
      status: 'answered',
      citations: [CITATION],
    });

    expect(markdown).toBe(
      [
        '## How much leave?',
        '',
        'You get 20 days [1].',
        '',
        '### Sources',
        '',
        '1. Handbook — page 3: Employees get 20 days of leave.',
      ].join('\n'),
    );
  });

  it('renders a refusal when there is insufficient evidence', () => {
    const markdown = buildAnswerMarkdown({
      question: 'Unknown?',
      answer: null,
      status: 'insufficient_evidence',
      citations: [],
    });

    expect(markdown).toContain('## Unknown?');
    expect(markdown).toContain('did not contain enough evidence');
    expect(markdown).not.toContain('### Sources');
  });
});

describe('answerPermalink', () => {
  it('builds an encoded absolute link', () => {
    expect(answerPermalink('https://app.example.com', 'org-1', 'answer 1')).toBe(
      'https://app.example.com/organizations/org-1/ask?answer=answer%201',
    );
  });
});

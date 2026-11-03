import { describe, expect, it } from 'vitest';
import {
  exportFilename,
  renderConversationMarkdown,
} from './conversation-markdown.js';

describe('conversation markdown', () => {
  it('neutralizes markup in titles, questions and sources without leaking internal fields', () => {
    const result = renderConversationMarkdown(
      {
        title: '<script>',
        turns: [
          {
            question: '# hello\n- item',
            answer: null,
            status: 'insufficient_evidence',
            citations: [
              { documentTitle: '<doc>', pageNumber: 2, storageKey: 'secret' },
            ],
          },
        ],
      },
      '2026-11-03',
    );
    expect(result).toContain('# &lt;script&gt;');
    expect(result).toContain('\\# hello  \n\\- item');
    expect(result).toContain('did not contain enough evidence');
    expect(result).toContain('- [1] &lt;doc&gt;, page 2');
    expect(result).not.toContain('secret');
  });

  it('keeps answer markdown readable but neutralizes raw html', () => {
    const result = renderConversationMarkdown(
      {
        title: 'Plan',
        turns: [
          {
            question: 'What is the total?',
            answer: 'The total is **3.5** units [2].\n<img src=x onerror=1>',
            status: 'answered',
            citations: [],
          },
        ],
      },
      '2026-11-03',
    );
    expect(result).toContain('The total is **3.5** units [2].');
    expect(result).toContain('&lt;img src=x onerror=1&gt;');
    expect(result).not.toContain('<img');
  });

  it('numbers sources by their citation markers', () => {
    const result = renderConversationMarkdown(
      {
        title: null,
        turns: [
          {
            question: 'Q',
            answer: 'A [3] and [1]',
            status: 'answered',
            citations: [
              { marker: 3, documentTitle: 'Third', pageNumber: 9 },
              { marker: 1, documentTitle: 'First', pageNumber: 1 },
            ],
          },
        ],
      },
      '2026-11-03',
    );
    expect(result).toContain(
      '### Sources\n\n- [1] First, page 1\n- [3] Third, page 9',
    );
  });

  it('makes a safe filename', () => {
    expect(exportFilename('../🔥', '2026-11-03')).toBe(
      'conversation-2026-11-03.md',
    );
    expect(exportFilename('Q3 Budget: Review', '2026-11-03')).toBe(
      'q3-budget-review-2026-11-03.md',
    );
  });
});

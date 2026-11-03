import { describe, expect, it } from 'vitest';
import {
  exportFilename,
  renderConversationMarkdown,
} from './conversation-markdown.js';

describe('conversation markdown', () => {
  it('escapes user content and renders sources without internal fields', () => {
    const result = renderConversationMarkdown(
      {
        title: '<script>',
        turns: [
          {
            question: '# hello',
            answer: 'See [this](url)',
            status: 'insufficient_evidence',
            citations: [
              { documentTitle: '<doc>', pageNumber: 2, storageKey: 'secret' },
            ],
          },
        ],
      },
      '2026-11-03',
    );
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('\\# hello');
    expect(result).toContain('Insufficient evidence.');
    expect(result).toContain('1. &lt;doc&gt;, page 2');
    expect(result).not.toContain('secret');
  });
  it('makes a safe filename', () => {
    expect(exportFilename('../🔥', '2026-11-03')).toBe(
      'conversation-2026-11-03.md',
    );
  });
});

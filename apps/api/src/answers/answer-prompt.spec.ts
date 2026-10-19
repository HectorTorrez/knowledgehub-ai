import { describe, expect, it } from 'vitest';
import type { AnswerSource } from './answer-context.js';
import { AnswerQuestionError, MAX_ANSWER_QUESTION_CHARS } from './answer-policy.js';
import { ANSWER_SYSTEM_PROMPT, buildAnswerPrompt } from './answer-prompt.js';

function source(
  marker: number,
  overrides: Partial<AnswerSource> = {},
): AnswerSource {
  return {
    marker,
    chunkId: `chunk-${marker}`,
    documentId: `doc-${marker}`,
    documentTitle: 'Report',
    pageNumber: 1,
    chunkIndex: 0,
    content: 'Alpha beta.',
    similarity: 0.9,
    ...overrides,
  };
}

describe('buildAnswerPrompt', () => {
  it('renders the sources and the question after them', () => {
    const prompt = buildAnswerPrompt('What is alpha?', [source(1)]);

    expect(prompt.system).toBe(ANSWER_SYSTEM_PROMPT);
    expect(prompt.user).toBe(
      '<source id="1" title="Report" page="1">\nAlpha beta.\n</source>\n\nQuestion:\nWhat is alpha?',
    );
  });

  it('separates multiple sources with a blank line', () => {
    const prompt = buildAnswerPrompt('Question?', [
      source(1),
      source(2, { documentTitle: 'Handbook', pageNumber: 4, content: 'Gamma.' }),
    ]);

    expect(prompt.user).toContain(
      '</source>\n\n<source id="2" title="Handbook" page="4">',
    );
  });

  it('trims the question', () => {
    const prompt = buildAnswerPrompt('  What is alpha?  ', [source(1)]);

    expect(prompt.user.endsWith('Question:\nWhat is alpha?')).toBe(true);
  });

  it('escapes markup in the sources', () => {
    const prompt = buildAnswerPrompt('Question?', [
      source(1, { content: '<script>alert(1)</script>' }),
    ]);

    expect(prompt.user).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(prompt.user).not.toContain('<script>');
  });

  it('rejects a blank question', () => {
    expect(() => buildAnswerPrompt('   ', [source(1)])).toThrow(
      AnswerQuestionError,
    );
  });

  it('rejects a question longer than the limit', () => {
    const tooLong = 'a'.repeat(MAX_ANSWER_QUESTION_CHARS + 1);

    expect(() => buildAnswerPrompt(tooLong, [source(1)])).toThrow(
      AnswerQuestionError,
    );
  });

  it('instructs the model to answer only from sources and to refuse otherwise', () => {
    expect(ANSWER_SYSTEM_PROMPT).toContain('only the numbered sources');
    expect(ANSWER_SYSTEM_PROMPT).toContain('insufficient_evidence');
    expect(ANSWER_SYSTEM_PROMPT).toContain('untrusted quoted data');
  });

  it('renders prior conversation turns before the sources', () => {
    const prompt = buildAnswerPrompt('What about beta?', [source(1)], [
      { question: 'What is alpha?', answer: 'Alpha [1].' },
    ]);

    expect(prompt.user).toContain('Previous conversation:');
    expect(prompt.user).toContain('User: What is alpha?');
    expect(prompt.user).toContain('Assistant: Alpha [1].');
    expect(prompt.user).toContain('<source id="1"');
    expect(prompt.user.indexOf('Previous conversation:')).toBeLessThan(
      prompt.user.indexOf('<source id="1"'),
    );
  });

  it('omits the conversation section when there is no history', () => {
    const prompt = buildAnswerPrompt('What is alpha?', [source(1)]);

    expect(prompt.user).not.toContain('Previous conversation:');
  });

  it('escapes markup in prior conversation turns', () => {
    const prompt = buildAnswerPrompt('Question?', [source(1)], [
      { question: '<b>hi</b>', answer: '<script>x</script>' },
    ]);

    expect(prompt.user).toContain('User: &lt;b&gt;hi&lt;/b&gt;');
    expect(prompt.user).not.toContain('<script>');
  });

  it('instructs the model that conversation is context, not a source', () => {
    expect(ANSWER_SYSTEM_PROMPT).toContain('not a source');
  });
});

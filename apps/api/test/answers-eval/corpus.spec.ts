import { describe, expect, it } from 'vitest';
import { RETRIEVAL_QUESTIONS } from '../../eval/questions.js';
import { allCorpusPages } from './corpus.js';
import { EVAL_QUESTIONS } from './questions.js';

describe('evaluation labels', () => {
  it('uses unique question IDs and points answer labels at existing source pages', () => {
    const pages = new Set(
      allCorpusPages().map(
        (page) => `${page.documentTitle}:${page.pageNumber}`,
      ),
    );
    for (const questions of [EVAL_QUESTIONS, RETRIEVAL_QUESTIONS])
      expect(new Set(questions.map((item) => item.id)).size).toBe(
        questions.length,
      );
    for (const item of EVAL_QUESTIONS) {
      expect(item.expected.length === 0).toBe(item.kind === 'unanswerable');
      for (const page of [...item.expected, ...item.supporting])
        expect(pages.has(`${page.documentTitle}:${page.pageNumber}`)).toBe(
          true,
        );
    }
  });
});

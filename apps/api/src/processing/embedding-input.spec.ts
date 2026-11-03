import { describe, expect, it } from 'vitest';
import { buildEmbeddingInput } from './document-chunk.store.js';

describe('buildEmbeddingInput', () => {
  it('adds document and page context without changing the content', () => {
    expect(
      buildEmbeddingInput('Informe', 3, 'Primera línea\nSegunda línea'),
    ).toBe('Document: Informe\nPage: 3\n\nPrimera línea\nSegunda línea');
  });
});

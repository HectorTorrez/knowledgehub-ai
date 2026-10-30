import { describe, expect, it } from 'vitest';
import { diversify } from './diversify.js';
import type { RetrievedChunk } from './retrieval.service.js';

describe('diversify', () => {
  it('caps each document while preserving rank order', () => {
    const chunks = ['a', 'a', 'b', 'a', 'a', 'a', 'b'].map(
      (documentId, index) =>
        ({
          documentId,
          chunkId: String(index),
          title: '',
          pageNumber: 1,
          chunkIndex: index,
          content: '',
          similarity: 1,
          lexicalMatch: true,
        }) satisfies RetrievedChunk,
    );
    expect(diversify(chunks).map((chunk) => chunk.chunkId)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '6',
    ]);
  });
});

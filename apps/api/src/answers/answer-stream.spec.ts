import { StreamableFile } from '@nestjs/common';
import type { AnswerResponse } from '@knowledgehub/shared-types';
import { describe, expect, it } from 'vitest';
import { toAnswerNdjsonStream, toAnswerStreamEvents } from './answer-stream.js';

const ANSWERED: AnswerResponse = {
  status: 'answered',
  answer: 'Retries are bounded [1].',
  citations: [
    {
      marker: 1,
      documentId: 'doc-1',
      documentTitle: 'Architecture Notes',
      pageNumber: 2,
      chunkIndex: 4,
      excerpt: 'excerpt',
    },
  ],
};

const REFUSED: AnswerResponse = {
  status: 'insufficient_evidence',
  answer: null,
  citations: [],
};

describe('toAnswerStreamEvents', () => {
  it('emits status, deltas, and citations for an answered response', () => {
    const events = toAnswerStreamEvents(ANSWERED);

    expect(events[0]).toEqual({ type: 'status', status: 'answered' });
    expect(events.at(-1)).toEqual({
      type: 'citations',
      citations: ANSWERED.citations,
    });

    const deltas = events.slice(1, -1);
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((event) => event.type === 'delta')).toBe(true);
    expect(
      deltas.map((event) => (event as { text: string }).text).join(''),
    ).toBe('Retries are bounded [1].');
  });

  it('chunks long answers into multiple deltas that reassemble the answer', () => {
    const long = 'a'.repeat(200);
    const events = toAnswerStreamEvents({ ...ANSWERED, answer: long });

    const deltas = events.filter((event) => event.type === 'delta');
    expect(deltas.length).toBeGreaterThan(1);
    expect(
      deltas.map((event) => (event as { text: string }).text).join(''),
    ).toBe(long);
  });

  it('emits only status and empty citations for insufficient evidence', () => {
    expect(toAnswerStreamEvents(REFUSED)).toEqual([
      { type: 'status', status: 'insufficient_evidence' },
      { type: 'citations', citations: [] },
    ]);
  });
});

describe('toAnswerNdjsonStream', () => {
  it('returns a StreamableFile typed as ndjson', () => {
    const file = toAnswerNdjsonStream(REFUSED);

    expect(file).toBeInstanceOf(StreamableFile);
  });
});

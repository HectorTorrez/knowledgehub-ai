import { describe, expect, it } from 'vitest';
import {
  meanReciprocalRank,
  recallAtK,
  reciprocalRank,
} from './retrieval-metrics.js';

describe('retrieval metrics', () => {
  const a = { title: 'A', pageNumber: 1 };
  const b = { title: 'A', pageNumber: 2 };
  const c = { title: 'B', pageNumber: 1 };

  it('counts unique relevant pages among the first k chunks', () => {
    expect(recallAtK([a, a, c, b], [a, b, b], 3)).toBe(0.5);
    expect(recallAtK([a, a, c, b], [a, b], 4)).toBe(1);
    expect(recallAtK([a], [], 5)).toBe(0);
  });

  it('scores the rank of the first relevant chunk, including misses', () => {
    expect(reciprocalRank([c, b, a], [a, b])).toBe(0.5);
    expect(reciprocalRank([c], [a])).toBe(0);
    expect(meanReciprocalRank([1, 0.5, 0])).toBe(0.5);
    expect(meanReciprocalRank([])).toBe(0);
  });
});

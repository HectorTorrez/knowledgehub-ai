import { describe, expect, it } from 'vitest';
import { compare } from './compare.js';

describe('evaluation regression comparison', () => {
  it('flags drops beyond tolerance and reports new metrics', () => {
    expect(
      compare({ a: 0.8, b: 0.8 }, { a: 0.74, b: 0.76, c: 1 }, 0.05).map(
        (row) => row.failed,
      ),
    ).toEqual([true, false, false]);
  });
  it('rejects missing metrics and invalid tolerances', () => {
    expect(() => compare({ a: 1 }, {}, 0.05)).toThrow();
    expect(() => compare({}, {}, -1)).toThrow();
  });
});

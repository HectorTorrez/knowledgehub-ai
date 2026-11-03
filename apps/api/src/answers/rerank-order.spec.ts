import { describe, expect, it } from 'vitest';
import { orderReranked } from './rerank-order.js';

describe('orderReranked', () => {
  const candidates = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  it('orders known scores, omits zero scores and preserves omitted candidates', () => {
    expect(orderReranked(candidates, [{ id: 'x', score: 3 }, { id: 'b', score: 0 }, { id: 'c', score: 2 }]).map(({ id }) => id)).toEqual(['c', 'a', 'd']);
  });
  it('retains zero scores when none is positive', () => {
    expect(orderReranked(candidates, [{ id: 'b', score: 0 }]).map(({ id }) => id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

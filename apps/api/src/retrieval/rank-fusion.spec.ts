import { describe, expect, it } from 'vitest';
import { fuseRanks } from './rank-fusion.js';

const item = (chunkId: string) => ({ chunkId });

describe('fuseRanks', () => {
  it('combines ranks, deduplicates, and retains candidates from either list', () => {
    expect(
      fuseRanks([
        [item('a'), item('b'), item('b')],
        [item('c'), item('b')],
      ]),
    ).toEqual([item('b'), item('a'), item('c')]);
  });

  it('orders equal scores deterministically by chunk id', () => {
    expect(fuseRanks([[item('z')], [item('a')]])).toEqual([
      item('a'),
      item('z'),
    ]);
  });
});

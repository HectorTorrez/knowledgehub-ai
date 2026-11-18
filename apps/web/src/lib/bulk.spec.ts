import { describe, expect, it } from 'vitest';
import { runBulk } from './bulk';

describe('runBulk', () => {
  it('separates successes from failures', async () => {
    const result = await runBulk([1, 2, 3, 4], async (value) => {
      if (value % 2 === 0) {
        throw new Error('even');
      }
    });

    expect(result.succeeded.sort()).toEqual([1, 3]);
    expect(result.failed.sort()).toEqual([2, 4]);
  });

  it('never runs more actions at once than the concurrency limit', async () => {
    let running = 0;
    let peak = 0;

    await runBulk(
      Array.from({ length: 10 }, (_, index) => index),
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
      },
      3,
    );

    expect(peak).toBe(3);
  });

  it('handles an empty selection', async () => {
    await expect(runBulk([], async () => undefined)).resolves.toEqual({
      succeeded: [],
      failed: [],
    });
  });
});

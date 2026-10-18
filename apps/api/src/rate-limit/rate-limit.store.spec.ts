import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimitStore } from './rate-limit.store.js';

describe('InMemoryRateLimitStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a new window at count one', async () => {
    const store = new InMemoryRateLimitStore();
    const hit = await store.hit('key', 60_000);
    expect(hit.count).toBe(1);
    expect(hit.resetAtMs).toBeGreaterThan(Date.now());
  });

  it('increments within the same window', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('key', 60_000);
    const second = await store.hit('key', 60_000);
    expect(second.count).toBe(2);
  });

  it('resets the window once it has elapsed', async () => {
    vi.useFakeTimers();
    const store = new InMemoryRateLimitStore();

    await store.hit('key', 60_000);
    vi.advanceTimersByTime(60_001);

    const after = await store.hit('key', 60_000);
    expect(after.count).toBe(1);
  });

  it('tracks each key independently', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('a', 60_000);
    await store.hit('a', 60_000);
    const b = await store.hit('b', 60_000);
    expect(b.count).toBe(1);
  });
});

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

export interface RateLimitHit {
  count: number;
  resetAtMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

interface WindowEntry {
  count: number;
  resetAtMs: number;
}

const MAX_TRACKED_KEYS = 10_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, WindowEntry>();

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || now >= existing.resetAtMs) {
      const entry = { count: 1, resetAtMs: now + windowMs };
      this.entries.set(key, entry);
      this.sweep(now);
      return entry;
    }

    existing.count += 1;
    return { count: existing.count, resetAtMs: existing.resetAtMs };
  }

  private sweep(now: number): void {
    if (this.entries.size <= MAX_TRACKED_KEYS) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAtMs) {
        this.entries.delete(key);
      }
    }
  }
}

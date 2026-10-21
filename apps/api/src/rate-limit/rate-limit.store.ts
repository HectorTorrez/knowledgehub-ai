import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

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

const REDIS_HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

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

export class RedisRateLimitStore implements RateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly client: Redis;

  constructor(
    url: string,
    private readonly fallback: RateLimitStore,
  ) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis rate-limit store error: ${error.message}`);
    });
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    try {
      const result = (await this.client.eval(
        REDIS_HIT_SCRIPT,
        1,
        `knowledgehub:rate-limit:${key}`,
        windowMs,
      )) as [number, number];

      return {
        count: Number(result[0]),
        resetAtMs: Date.now() + Math.max(Number(result[1]), 1),
      };
    } catch (error) {
      this.logger.warn(
        `Redis rate-limit lookup failed; using the in-process fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fallback.hit(key, windowMs);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

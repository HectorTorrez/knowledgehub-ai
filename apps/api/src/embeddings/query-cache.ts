import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import type { OnModuleDestroy } from '@nestjs/common';

export interface QueryCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function queryCacheKey(model: string, text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return `${model}:${createHash('sha256').update(normalized).digest('hex')}`;
}

export class MemoryQueryCache implements QueryCache {
  private readonly entries = new Map<
    string,
    { value: string; expires: number }
  >();
  constructor(
    private readonly max: number,
    private readonly ttl: number,
    private readonly now = Date.now,
  ) {}
  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.expires <= this.now()) return null;
    this.entries.set(key, entry);
    return entry.value;
  }
  async set(key: string, value: string): Promise<void> {
    if (!this.max || !this.ttl) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttl * 1000 });
    if (this.entries.size > this.max)
      this.entries.delete(this.entries.keys().next().value!);
  }
}

export class RedisQueryCache implements QueryCache, OnModuleDestroy {
  private readonly client: Redis;
  constructor(
    url: string,
    private readonly ttl: number,
  ) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
  }
  async get(key: string): Promise<string | null> {
    return this.ttl ? this.client.get(`knowledgehub:query-cache:${key}`) : null;
  }
  async set(key: string, value: string): Promise<void> {
    if (this.ttl)
      await this.client.set(
        `knowledgehub:query-cache:${key}`,
        value,
        'EX',
        this.ttl,
      );
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

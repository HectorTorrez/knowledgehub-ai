export interface BulkResult<T> {
  succeeded: T[];
  failed: T[];
}

export async function runBulk<T>(
  items: readonly T[],
  action: (item: T) => Promise<unknown>,
  concurrency = 4,
): Promise<BulkResult<T>> {
  const succeeded: T[] = [];
  const failed: T[] = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const item = items[next++] as T;

      try {
        await action(item);
        succeeded.push(item);
      } catch {
        failed.push(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return { succeeded, failed };
}

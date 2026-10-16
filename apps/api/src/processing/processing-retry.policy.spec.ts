import { describe, expect, it } from 'vitest';
import {
  PROCESSING_RETRY_BASE_DELAY_MS,
  PROCESSING_RETRY_MAX_DELAY_MS,
  processingRetryDelayMs,
} from './processing-retry.policy.js';

describe('processingRetryDelayMs', () => {
  it('doubles the delay for each exhausted attempt', () => {
    expect(processingRetryDelayMs(1)).toBe(2_000);
    expect(processingRetryDelayMs(2)).toBe(4_000);
    expect(processingRetryDelayMs(3)).toBe(8_000);
    expect(processingRetryDelayMs(4)).toBe(16_000);
  });

  it('is non-decreasing and never exceeds the maximum delay', () => {
    const attempts = [0, 1, 2, 3, 4, 5, 6, 10, 100];
    const delays = attempts.map((attempt) => processingRetryDelayMs(attempt));

    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index]).toBeGreaterThanOrEqual(delays[index - 1]!);
    }

    expect(delays[0]).toBe(PROCESSING_RETRY_BASE_DELAY_MS);
    expect(delays.at(-1)).toBe(PROCESSING_RETRY_MAX_DELAY_MS);
  });
});

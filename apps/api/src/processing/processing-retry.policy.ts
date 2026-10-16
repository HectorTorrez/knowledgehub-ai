export const PROCESSING_RETRY_BASE_DELAY_MS = 2_000;

export const PROCESSING_RETRY_MAX_DELAY_MS = 60_000;

export function processingRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(
    PROCESSING_RETRY_BASE_DELAY_MS * 2 ** exponent,
    PROCESSING_RETRY_MAX_DELAY_MS,
  );
}

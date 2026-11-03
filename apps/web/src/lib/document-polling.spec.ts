import { describe, expect, it } from 'vitest';
import {
  PENDING_UPLOAD_WINDOW_MS,
  POLL_INTERVAL_MS,
  pollingInterval,
  terminalTransition,
} from './document-polling';

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const updatedAgo = (ms: number) => new Date(NOW - ms).toISOString();

describe('document polling', () => {
  it('polls only while the tab is visible and a document is processing', () => {
    const active = [{ status: 'PROCESSING' as const, updatedAt: updatedAgo(0) }];
    expect(pollingInterval(active, true, NOW)).toBe(POLL_INTERVAL_MS);
    expect(pollingInterval(active, false, NOW)).toBe(false);
    expect(
      pollingInterval([{ status: 'READY', updatedAt: updatedAgo(0) }], true, NOW),
    ).toBe(false);
  });

  it('stops polling uploads that were abandoned', () => {
    expect(
      pollingInterval(
        [{ status: 'PENDING', updatedAt: updatedAgo(60_000) }],
        true,
        NOW,
      ),
    ).toBe(POLL_INTERVAL_MS);
    expect(
      pollingInterval(
        [{ status: 'PENDING', updatedAt: updatedAgo(PENDING_UPLOAD_WINDOW_MS) }],
        true,
        NOW,
      ),
    ).toBe(false);
  });

  it('detects only transitions from active to terminal', () => {
    expect(terminalTransition('PROCESSING', 'READY')).toBe('READY');
    expect(terminalTransition('PENDING', 'FAILED')).toBe('FAILED');
    expect(terminalTransition(undefined, 'READY')).toBeUndefined();
    expect(terminalTransition('READY', 'READY')).toBeUndefined();
  });
});

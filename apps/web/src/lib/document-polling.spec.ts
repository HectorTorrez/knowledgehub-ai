import { describe, expect, it } from 'vitest';
import { pollingInterval, terminalTransition } from './document-polling';

describe('document polling', () => {
  it('polls only visible active documents', () => {
    const active = [
      { status: 'PROCESSING' as const, processingStage: 'PROCESSING' as const },
    ];
    expect(pollingInterval(active, true)).toBe(2500);
    expect(pollingInterval(active, false)).toBe(false);
    expect(
      pollingInterval([{ status: 'READY', processingStage: 'READY' }], true),
    ).toBe(false);
  });

  it('detects only transitions from active to terminal', () => {
    expect(terminalTransition('PROCESSING', 'READY')).toBe('READY');
    expect(terminalTransition('PENDING', 'FAILED')).toBe('FAILED');
    expect(terminalTransition(undefined, 'READY')).toBeUndefined();
    expect(terminalTransition('READY', 'READY')).toBeUndefined();
  });
});

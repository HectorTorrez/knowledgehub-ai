import { describe, expect, it } from 'vitest';
import { usageProgress } from './usage';

describe('usageProgress', () => {
  it('classifies thresholds and clamps overages', () => {
    expect(usageProgress(79, 100)).toEqual({ value: 79, tone: 'normal' });
    expect(usageProgress(80, 100)).toEqual({ value: 80, tone: 'warning' });
    expect(usageProgress(100, 100)).toEqual({ value: 100, tone: 'destructive' });
    expect(usageProgress(120, 100)).toEqual({ value: 100, tone: 'destructive' });
  });

  it('handles unlimited and zero limits', () => {
    expect(usageProgress(10, null)).toEqual({ value: 0, tone: 'normal' });
    expect(usageProgress(0, 0)).toEqual({ value: 100, tone: 'destructive' });
  });
});

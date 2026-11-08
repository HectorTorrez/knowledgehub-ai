export type Metrics = Record<string, number>;

export function compare(
  baseline: Metrics,
  current: Metrics,
  tolerance: number,
) {
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new Error('Invalid tolerance');
  return Object.keys({ ...baseline, ...current })
    .sort()
    .map((metric) => {
      const expected = baseline[metric];
      const actual = current[metric];
      if (actual === undefined || !Number.isFinite(actual))
        throw new Error(`Missing or invalid metric: ${metric}`);
      if (expected !== undefined && !Number.isFinite(expected))
        throw new Error(`Invalid baseline: ${metric}`);
      return {
        metric,
        expected,
        actual,
        failed: expected !== undefined && actual < expected - tolerance,
      };
    });
}

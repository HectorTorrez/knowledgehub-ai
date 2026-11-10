import { describe, expect, it } from 'vitest';
import { collectReportMetrics } from './report-metrics.js';

const retrieval = { recall5: 0.8, recall10: 1, mrr: 0.9 };
const sweep = {
  entailmentAccuracy: 0.5,
  citationPrecision: 1,
  citationRecall: 0.8,
  exactMatchRate: 0.7,
  groundingHitRate: 1,
  structuralIntegrity: 1,
  refusalAccuracy: 1,
  falseRefusalRate: 0.2,
};

describe('evaluation report metrics', () => {
  it('preserves grounding judgments and converts false refusals into a higher-is-better metric', () => {
    const metrics = collectReportMetrics(retrieval, { '0.2': sweep });
    expect(metrics['answers.0.2.entailmentAccuracy']).toBe(0.5);
    expect(metrics['answers.0.2.nonFalseRefusalRate']).toBe(0.8);
  });
  it('rejects incomplete, empty, or invalid provider evaluation reports', () => {
    expect(() => collectReportMetrics(retrieval, {})).toThrow();
    expect(() =>
      collectReportMetrics(retrieval, {
        '0.2': { ...sweep, entailmentAccuracy: undefined },
      }),
    ).toThrow();
    expect(() =>
      collectReportMetrics({ ...retrieval, mrr: 2 }, { '0.2': sweep }),
    ).toThrow();
  });
});

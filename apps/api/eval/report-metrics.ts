import { z } from 'zod';
import type { Metrics } from './compare.js';

const ratio = z.number().min(0).max(1);
const answerMetrics = z.object({
  entailmentAccuracy: ratio.nullable(),
  citationPrecision: ratio.nullable(),
  citationRecall: ratio.nullable(),
  exactMatchRate: ratio.nullable(),
  groundingHitRate: ratio.nullable(),
  structuralIntegrity: ratio,
  refusalAccuracy: ratio.nullable(),
  falseRefusalRate: ratio.nullable(),
});

export function collectReportMetrics(
  retrieval: unknown,
  answers: unknown,
): Metrics {
  const retrievalMetrics = z
    .object({ recall5: ratio, recall10: ratio, mrr: ratio })
    .parse(retrieval);
  const sweeps = z
    .record(z.string().regex(/^0(?:\.\d+)?$|^1(?:\.0+)?$/), answerMetrics)
    .refine(
      (value) => Object.keys(value).length > 0,
      'Answer evaluation has no sweeps',
    )
    .parse(answers);
  const current: Metrics = {};
  for (const [key, value] of Object.entries(retrievalMetrics))
    current[`retrieval.${key}`] = value;
  for (const [threshold, metrics] of Object.entries(sweeps)) {
    for (const [key, value] of Object.entries(metrics)) {
      if (value === null) continue;
      current[
        `answers.${threshold}.${key === 'falseRefusalRate' ? 'nonFalseRefusalRate' : key}`
      ] = key === 'falseRefusalRate' ? 1 - value : value;
    }
  }
  return current;
}

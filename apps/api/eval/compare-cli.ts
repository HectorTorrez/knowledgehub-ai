import { readFileSync, writeFileSync } from 'node:fs';
import { compare, type Metrics } from './compare.js';

const read = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const retrieval = read('eval/retrieval-results.json');
const answers = read('eval/answers-results.json');
const current: Metrics = {};
for (const key of ['recall5', 'recall10', 'mrr'])
  current[`retrieval.${key}`] = retrieval[key] as number;
for (const [threshold, value] of Object.entries(answers)) {
  const metrics = value as Record<string, number | null>;
  for (const key of [
    'citationPrecision',
    'citationRecall',
    'exactMatchRate',
    'groundingHitRate',
    'structuralIntegrity',
    'refusalAccuracy',
  ]) {
    if (metrics[key] !== null && metrics[key] !== undefined)
      current[`answers.${threshold}.${key}`] = metrics[key];
  }
  if (
    metrics.falseRefusalRate !== null &&
    metrics.falseRefusalRate !== undefined
  )
    current[`answers.${threshold}.nonFalseRefusalRate`] =
      1 - metrics.falseRefusalRate;
}
if (process.argv.includes('--update')) {
  writeFileSync('eval/baseline.json', JSON.stringify(current, null, 2) + '\n');
} else {
  const rows = compare(
    read('eval/baseline.json') as Metrics,
    current,
    Number(process.env.EVAL_TOLERANCE ?? '0.05'),
  );
  console.log(
    [
      '| Metric | Baseline | Current | Result |',
      '| --- | ---: | ---: | --- |',
      ...rows.map(
        ({ metric, expected, actual, failed }) =>
          `| ${metric} | ${expected?.toFixed(3) ?? 'pending'} | ${actual.toFixed(3)} | ${expected === undefined ? 'report only' : failed ? 'FAIL' : 'pass'} |`,
      ),
    ].join('\n'),
  );
  if (rows.some((row) => row.failed)) process.exitCode = 1;
}

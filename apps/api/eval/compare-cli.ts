import { collectReportMetrics } from './report-metrics.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { compare, type Metrics } from './compare.js';

const read = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const retrieval = read('eval/retrieval-results.json');
const answers = read('eval/answers-results.json');
const current = collectReportMetrics(retrieval, answers);
if (process.argv.includes('--update')) {
  compare({}, current, 0);
  for (const [metric, value] of Object.entries(current)) {
    if (
      (metric.endsWith('.structuralIntegrity') ||
        metric.endsWith('.refusalAccuracy')) &&
      value !== 1
    )
      throw new Error(`Cannot baseline a failed hard gate: ${metric}`);
  }
  const answerRun = read('eval/metadata-results.json');
  const retrievalRun = read('eval/retrieval-metadata-results.json');
  if (
    answerRun.corpusHash !== retrievalRun.corpusHash ||
    answerRun.embeddingModel !== retrievalRun.embeddingModel
  )
    throw new Error(
      'Evaluation reports use different corpora or embedding models; rerun both evaluations',
    );
  writeFileSync(
    'eval/baseline-metadata.json',
    JSON.stringify({ answerRun, retrievalRun }, null, 2) + '\n',
  );
  writeFileSync('eval/baseline.json', JSON.stringify(current, null, 2) + '\n');
} else {
  const baseline = read('eval/baseline.json') as Metrics;
  if (!Object.keys(baseline).length)
    throw new Error(
      'No measured evaluation baseline; run both evaluations and eval:baseline',
    );
  const rows = compare(
    baseline,
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

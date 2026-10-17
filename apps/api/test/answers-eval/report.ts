import {
  type EvalMetrics,
  type QuestionOutcome,
  formatCitation,
  scoreOutcome,
} from './metrics.js';

export interface SweepRun {
  threshold: number;
  outcomes: QuestionOutcome[];
  metrics: EvalMetrics;
}

export interface EvalMetadata {
  model: string;
  embeddingModel: string;
  questionCount: number;
}

function percentage(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2);
}

function duration(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value)}ms`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width);
}

function formatOutcomes(outcomes: QuestionOutcome[]): string {
  const header = [
    pad('id', 30),
    pad('kind', 14),
    pad('status', 21),
    pad('cited', 6),
    pad('expected', 9),
    pad('prec', 6),
    pad('rec', 6),
    pad('ground', 7),
    pad('latency', 9),
    'tokens',
  ].join(' ');

  const rows = outcomes.map((outcome) => {
    const score = scoreOutcome(outcome);
    const tokens =
      outcome.inputTokens === null && outcome.outputTokens === null
        ? 'n/a'
        : `${outcome.inputTokens ?? '?'}/${outcome.outputTokens ?? '?'}`;
    const ground =
      score.groundingHit === null ? 'n/a' : score.groundingHit ? 'hit' : 'miss';

    return [
      pad(outcome.id, 30),
      pad(outcome.kind, 14),
      pad(outcome.status, 21),
      pad(String(outcome.citations.length), 6),
      pad(String(outcome.expected.length), 9),
      pad(percentage(score.precision), 6),
      pad(percentage(score.recall), 6),
      pad(ground, 7),
      pad(duration(outcome.latencyMs), 9),
      tokens,
    ].join(' ');
  });

  return [header, ...rows].join('\n');
}

function formatMetrics(metrics: EvalMetrics): string {
  return [
    `metrics: answered=${metrics.answered} refused=${metrics.refused} errored=${metrics.errored}`,
    `         precision=${percentage(metrics.citationPrecision)} recall=${percentage(metrics.citationRecall)} exact=${percentage(metrics.exactMatchRate)} grounding=${percentage(metrics.groundingHitRate)}`,
    `         structural=${percentage(metrics.structuralIntegrity)} refusal=${percentage(metrics.refusalAccuracy)} false-refusal=${percentage(metrics.falseRefusalRate)}`,
    `         latency p50=${duration(metrics.latencyP50Ms)} p95=${duration(metrics.latencyP95Ms)} tokens=${metrics.inputTokens}/${metrics.outputTokens} (reported by ${metrics.tokenReports}/${metrics.total})`,
  ].join('\n');
}

function formatFailures(outcomes: QuestionOutcome[]): string {
  const failures = outcomes.flatMap((outcome) => {
    if (outcome.violation !== null) {
      return [`${outcome.id}: structural violation (${outcome.violation})`];
    }

    if (outcome.expected.length > 0 && outcome.status === 'insufficient_evidence') {
      return [
        `${outcome.id}: false refusal (expected ${outcome.expected.map(formatCitation).join(', ')})`,
      ];
    }

    if (outcome.expected.length === 0 && outcome.status === 'answered') {
      return [
        `${outcome.id}: answered an unanswerable question: ${outcome.answer ?? ''}`,
      ];
    }

    if (outcome.status === 'answered') {
      const cited = new Set(
        outcome.citations.map(
          (citation) => `${citation.documentTitle}\u0000${citation.pageNumber}`,
        ),
      );
      const missing = outcome.expected.filter(
        (citation) =>
          !cited.has(`${citation.documentTitle}\u0000${citation.pageNumber}`),
      );

      if (missing.length > 0) {
        return [
          `${outcome.id}: missing citations for ${missing.map(formatCitation).join(', ')}`,
        ];
      }
    }

    return [];
  });

  return failures.length === 0
    ? 'failures: none'
    : ['failures:', ...failures.map((failure) => `- ${failure}`)].join('\n');
}

function formatSummary(runs: SweepRun[]): string {
  const header = [
    pad('floor', 7),
    pad('answered', 9),
    pad('refused', 8),
    pad('errored', 8),
    pad('prec', 6),
    pad('rec', 6),
    pad('exact', 6),
    pad('ground', 7),
    pad('struct', 7),
    pad('refusal', 8),
    pad('false-ref', 10),
    pad('p95', 8),
    'tokens',
  ].join(' ');

  const rows = runs.map((run) => {
    const metrics = run.metrics;

    return [
      pad(String(run.threshold), 7),
      pad(String(metrics.answered), 9),
      pad(String(metrics.refused), 8),
      pad(String(metrics.errored), 8),
      pad(percentage(metrics.citationPrecision), 6),
      pad(percentage(metrics.citationRecall), 6),
      pad(percentage(metrics.exactMatchRate), 6),
      pad(percentage(metrics.groundingHitRate), 7),
      pad(percentage(metrics.structuralIntegrity), 7),
      pad(percentage(metrics.refusalAccuracy), 8),
      pad(percentage(metrics.falseRefusalRate), 10),
      pad(duration(metrics.latencyP95Ms), 8),
      `${metrics.inputTokens}/${metrics.outputTokens}`,
    ].join(' ');
  });

  return [header, ...rows].join('\n');
}

export function formatSweepReport(
  runs: SweepRun[],
  metadata: EvalMetadata,
): string {
  const lines = [
    'Answers evaluation (real providers)',
    `answer model: ${metadata.model}`,
    `embedding model: ${metadata.embeddingModel}`,
    `questions: ${metadata.questionCount}`,
    `thresholds: ${runs.map((run) => run.threshold).join(', ')}`,
  ];

  for (const run of runs) {
    lines.push(
      '',
      `=== similarity floor ${run.threshold} ===`,
      formatOutcomes(run.outcomes),
      formatMetrics(run.metrics),
      formatFailures(run.outcomes),
    );

    for (const outcome of run.outcomes) {
      if (outcome.status === 'answered' && outcome.answer !== null) {
        lines.push(`${outcome.id} answer: ${outcome.answer}`);
      }
    }
  }

  lines.push('', '=== sweep summary ===', formatSummary(runs));
  return lines.join('\n');
}

export type EvalKind =
  | 'single_source'
  | 'multi_source'
  | 'distractor'
  | 'unanswerable'
  | 'calculation';

export interface CitationRef {
  documentTitle: string;
  pageNumber: number;
}

export interface EvalQuestion {
  id: string;
  question: string;
  kind: EvalKind;
  history?: Array<{ question: string; answer: string }>;
  expected: CitationRef[];
  supporting: CitationRef[];
  expectedValue?: string;
}

export type OutcomeStatus = 'answered' | 'insufficient_evidence' | 'error';

export interface QuestionOutcome {
  id: string;
  kind: EvalKind;
  status: OutcomeStatus;
  citations: CitationRef[];
  expected: CitationRef[];
  supporting: CitationRef[];
  expectedValue?: string;
  answer: string | null;
  violation: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface EvalMetrics {
  total: number;
  answered: number;
  refused: number;
  errored: number;
  calculationAccuracy: number | null;
  citationPrecision: number | null;
  citationRecall: number | null;
  exactMatchRate: number | null;
  groundingHitRate: number | null;
  documentHitRate: number | null;
  structuralIntegrity: number;
  refusalAccuracy: number | null;
  falseRefusalRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  inputTokens: number;
  outputTokens: number;
  tokenReports: number;
}

function citationKey(citation: CitationRef): string {
  return `${citation.documentTitle}\u0000${citation.pageNumber}`;
}

function citationKeys(citations: CitationRef[]): Set<string> {
  return new Set(citations.map(citationKey));
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let size = 0;

  for (const value of left) {
    if (right.has(value)) {
      size += 1;
    }
  }

  return size;
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && intersectionSize(left, right) === left.size;
}

export interface OutcomeScore {
  precision: number | null;
  recall: number | null;
  groundingHit: boolean | null;
  documentHit: boolean | null;
}

export function scoreOutcome(outcome: QuestionOutcome): OutcomeScore {
  const cited = citationKeys(outcome.citations);
  const expected = citationKeys(outcome.expected);
  const supporting = citationKeys(outcome.supporting);
  const hits = intersectionSize(cited, expected);

  return {
    documentHit: outcome.expected.length === 0
      ? null
      : outcome.citations.some((citation) =>
          outcome.expected.some((item) => item.documentTitle === citation.documentTitle),
        ),
    precision: cited.size === 0 ? null : hits / cited.size,
    recall: expected.size === 0 ? null : hits / expected.size,
    groundingHit:
      supporting.size === 0 ? null : intersectionSize(cited, supporting) > 0,
  };
}

export function percentile(values: number[], proportion: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(proportion * sorted.length) - 1),
  );

  return sorted[index] ?? null;
}

function sumTokens(
  outcomes: QuestionOutcome[],
  field: 'inputTokens' | 'outputTokens',
): number {
  return outcomes.reduce((total, outcome) => total + (outcome[field] ?? 0), 0);
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

export function containsValue(
  answer: string | null | undefined,
  expected: string,
): boolean {
  return (
    answer !== null &&
    answer !== undefined &&
    collapseSpaces(answer).includes(collapseSpaces(expected))
  );
}

export function computeMetrics(outcomes: QuestionOutcome[]): EvalMetrics {
  const calculations = outcomes.filter((outcome) => outcome.kind === 'calculation');
  const answerable = outcomes.filter((outcome) => outcome.expected.length > 0);
  const unanswerable = outcomes.filter((outcome) => outcome.expected.length === 0);
  const answered = outcomes.filter((outcome) => outcome.status === 'answered');
  const answeredAnswerable = answered.filter(
    (outcome) => outcome.expected.length > 0,
  );
  const violations = outcomes.filter((outcome) => outcome.violation !== null);

  const citedTotal = answeredAnswerable.reduce(
    (total, outcome) => total + citationKeys(outcome.citations).size,
    0,
  );
  const citedHits = answeredAnswerable.reduce(
    (total, outcome) =>
      total +
      intersectionSize(
        citationKeys(outcome.citations),
        citationKeys(outcome.expected),
      ),
    0,
  );
  const expectedTotal = answerable.reduce(
    (total, outcome) => total + citationKeys(outcome.expected).size,
    0,
  );
  const expectedHits = answerable.reduce(
    (total, outcome) =>
      total +
      intersectionSize(
        citationKeys(outcome.citations),
        citationKeys(outcome.expected),
      ),
    0,
  );
  const exactMatches = answerable.filter((outcome) =>
    sameSet(citationKeys(outcome.citations), citationKeys(outcome.expected)),
  ).length;
  const groundingHits = answeredAnswerable.filter(
    (outcome) =>
      intersectionSize(
        citationKeys(outcome.citations),
        citationKeys(outcome.supporting),
      ) > 0,
  ).length;
  const refusedAnswerable = answerable.filter(
    (outcome) => outcome.status === 'insufficient_evidence',
  ).length;
  const refusedUnanswerable = unanswerable.filter(
    (outcome) => outcome.status === 'insufficient_evidence',
  ).length;
  const latencies = outcomes
    .map((outcome) => outcome.latencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const tokenReports = outcomes.filter(
    (outcome) => outcome.inputTokens !== null || outcome.outputTokens !== null,
  ).length;

  return {
    total: outcomes.length,
    answered: answered.length,
    refused: outcomes.filter(
      (outcome) => outcome.status === 'insufficient_evidence',
    ).length,
    errored: outcomes.filter((outcome) => outcome.status === 'error').length,
    calculationAccuracy: calculations.length === 0
      ? null
      : calculations.filter((outcome) =>
          outcome.status === 'answered' &&
          outcome.expectedValue !== undefined &&
          containsValue(outcome.answer, outcome.expectedValue),
        ).length / calculations.length,
    citationPrecision: citedTotal === 0 ? null : citedHits / citedTotal,
    citationRecall: expectedTotal === 0 ? null : expectedHits / expectedTotal,
    exactMatchRate: answerable.length === 0 ? null : exactMatches / answerable.length,
    groundingHitRate:
      answeredAnswerable.length === 0
        ? null
        : groundingHits / answeredAnswerable.length,
    documentHitRate: answerable.length === 0
      ? null
      : answerable.filter((outcome) => scoreOutcome(outcome).documentHit).length / answerable.length,
    structuralIntegrity:
      outcomes.length === 0 ? 1 : 1 - violations.length / outcomes.length,
    refusalAccuracy:
      unanswerable.length === 0
        ? null
        : refusedUnanswerable / unanswerable.length,
    falseRefusalRate:
      answerable.length === 0 ? null : refusedAnswerable / answerable.length,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    inputTokens: sumTokens(outcomes, 'inputTokens'),
    outputTokens: sumTokens(outcomes, 'outputTokens'),
    tokenReports,
  };
}

export function formatCitation(citation: CitationRef): string {
  return `${citation.documentTitle} p.${citation.pageNumber}`;
}

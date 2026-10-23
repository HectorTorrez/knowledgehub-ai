import type { AnswerCitation } from '@knowledgehub/shared-types';
import type { AnswerSource } from './answer-context.js';
import { CITATION_EXCERPT_MAX_CHARS } from './answer-policy.js';

export type AnswerContractViolationReason =
  | 'NOT_AN_OBJECT'
  | 'UNEXPECTED_FIELDS'
  | 'UNEXPECTED_STATUS'
  | 'REFUSAL_WITH_CLAIMS'
  | 'NO_CLAIMS'
  | 'INVALID_CLAIM'
  | 'INVALID_CLAIM_TEXT'
  | 'INVALID_CLAIM_SOURCE'
  | 'UNKNOWN_SOURCE';

export interface AnswerContractViolation {
  reason: AnswerContractViolationReason;
  detail: string;
}

export type AnswerContract =
  | { ok: true; status: 'answered'; answer: string; markers: number[] }
  | { ok: true; status: 'insufficient_evidence' }
  | { ok: false; violation: AnswerContractViolation };

export interface AnswerClaim {
  text: string;
  source: number;
}

function violation(
  reason: AnswerContractViolationReason,
  detail: string,
): AnswerContract {
  return { ok: false, violation: { reason, detail } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildExcerpt(
  content: string,
  maxChars: number = CITATION_EXCERPT_MAX_CHARS,
): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= maxChars) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(maxChars - 1, 0)).trimEnd()}…`;
}

export function buildCitations(
  markers: number[],
  sources: AnswerSource[],
  maxExcerptChars: number = CITATION_EXCERPT_MAX_CHARS,
): AnswerCitation[] {
  const byMarker = new Map(sources.map((source) => [source.marker, source]));

  return [...new Set(markers)]
    .sort((a, b) => a - b)
    .map((marker) => byMarker.get(marker))
    .filter((source): source is AnswerSource => source !== undefined)
    .map((source) => ({
      marker: source.marker,
      documentId: source.documentId,
      documentTitle: source.documentTitle,
      pageNumber: source.pageNumber,
      chunkIndex: source.chunkIndex,
      excerpt: buildExcerpt(source.content, maxExcerptChars),
    }));
}

function parseClaims(
  value: unknown,
  sourceCount: number,
): { claims: AnswerClaim[] } | { violation: AnswerContractViolation } {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      violation: {
        reason: 'NO_CLAIMS',
        detail: 'An answered response must carry at least one claim',
      },
    };
  }

  const claims: AnswerClaim[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) {
      return {
        violation: { reason: 'INVALID_CLAIM', detail: 'A claim must be an object' },
      };
    }

    if (typeof entry.text !== 'string') {
      return {
        violation: {
          reason: 'INVALID_CLAIM_TEXT',
          detail: 'A claim must carry a string text',
        },
      };
    }

    const text = entry.text.trim();

    if (text.length === 0) {
      return {
        violation: {
          reason: 'INVALID_CLAIM_TEXT',
          detail: 'A claim must not be blank',
        },
      };
    }

    if (typeof entry.source !== 'number' || !Number.isInteger(entry.source)) {
      return {
        violation: {
          reason: 'INVALID_CLAIM_SOURCE',
          detail: 'A claim must carry an integer source',
        },
      };
    }

    if (entry.source < 1 || entry.source > sourceCount) {
      return {
        violation: {
          reason: 'UNKNOWN_SOURCE',
          detail: `A claim cited a source that was not provided: ${entry.source}`,
        },
      };
    }

    if (seen.has(text)) {
      continue;
    }

    seen.add(text);
    claims.push({ text, source: entry.source });
  }

  return { claims };
}

const SENTENCE_END = /([.!?…])$/;

export function renderClaim(claim: AnswerClaim): string {
  const marker = `[${claim.source}]`;

  return SENTENCE_END.test(claim.text)
    ? claim.text.replace(SENTENCE_END, ` ${marker}$1`)
    : `${claim.text} ${marker}`;
}

function renderAnswer(claims: AnswerClaim[]): string {
  return claims.map(renderClaim).join(' ');
}

export function validateAnswerContract(
  value: unknown,
  sources: AnswerSource[],
): AnswerContract {
  if (!isRecord(value)) {
    return violation('NOT_AN_OBJECT', 'The answer provider did not return an object');
  }

  const keys = Object.keys(value).sort();

  if (keys.length !== 2 || keys[0] !== 'claims' || keys[1] !== 'status') {
    return violation(
      'UNEXPECTED_FIELDS',
      `The answer provider returned unexpected fields: ${keys.join(', ') || '(none)'}`,
    );
  }

  if (value.status !== 'answered' && value.status !== 'insufficient_evidence') {
    return violation(
      'UNEXPECTED_STATUS',
      `The answer provider returned an unexpected status: ${String(value.status)}`,
    );
  }

  if (value.status === 'insufficient_evidence') {
    if (value.claims !== null) {
      return violation(
        'REFUSAL_WITH_CLAIMS',
        'An insufficient_evidence response must not carry claims',
      );
    }

    return { ok: true, status: 'insufficient_evidence' };
  }

  const parsed = parseClaims(value.claims, sources.length);

  if ('violation' in parsed) {
    return { ok: false, violation: parsed.violation };
  }

  return {
    ok: true,
    status: 'answered',
    answer: renderAnswer(parsed.claims),
    markers: [...new Set(parsed.claims.map((claim) => claim.source))].sort(
      (a, b) => a - b,
    ),
  };
}

import type { AnswerCitation } from '@knowledgehub/shared-types';
import type { AnswerSource } from './answer-context.js';
import { CITATION_EXCERPT_MAX_CHARS } from './answer-policy.js';

export type AnswerStatus = 'answered' | 'insufficient_evidence';

export type AnswerContractViolationReason =
  | 'NOT_AN_OBJECT'
  | 'UNEXPECTED_FIELDS'
  | 'UNEXPECTED_STATUS'
  | 'INVALID_ANSWER_TYPE'
  | 'EMPTY_ANSWER'
  | 'MALFORMED_MARKER'
  | 'NO_CITATIONS'
  | 'UNKNOWN_SOURCE'
  | 'REFUSAL_WITH_ANSWER';

export interface AnswerContractViolation {
  reason: AnswerContractViolationReason;
  detail: string;
}

export type AnswerContract =
  | { ok: true; status: 'answered'; answer: string; markers: number[] }
  | { ok: true; status: 'insufficient_evidence' }
  | { ok: false; violation: AnswerContractViolation };

const MARKER_SYNTAX = /^\d+$/;
const MAX_MALFORMED_DETAIL_CHARS = 20;

function violation(
  reason: AnswerContractViolationReason,
  detail: string,
): AnswerContract {
  return { ok: false, violation: { reason, detail } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCitationMarkers(answer: string): {
  markers: number[];
  malformed: string[];
} {
  const markers = new Set<number>();
  const malformed: string[] = [];
  let index = 0;

  while (index < answer.length) {
    const open = answer.indexOf('[', index);

    if (open === -1) {
      break;
    }

    const close = answer.indexOf(']', open + 1);
    const group =
      close === -1 ? answer.slice(open + 1) : answer.slice(open + 1, close);

    if (/\d/.test(group)) {
      if (close !== -1 && MARKER_SYNTAX.test(group)) {
        markers.add(Number(group));
      } else {
        malformed.push(`[${group.slice(0, MAX_MALFORMED_DETAIL_CHARS)}]`);
      }
    }

    index = close === -1 ? answer.length : close + 1;
  }

  return {
    markers: [...markers].sort((a, b) => a - b),
    malformed,
  };
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

export function validateAnswerContract(
  value: unknown,
  sources: AnswerSource[],
): AnswerContract {
  if (!isRecord(value)) {
    return violation('NOT_AN_OBJECT', 'The answer provider did not return an object');
  }

  const keys = Object.keys(value).sort();

  if (keys.length !== 2 || keys[0] !== 'answer' || keys[1] !== 'status') {
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
    if (value.answer !== null) {
      return violation(
        'REFUSAL_WITH_ANSWER',
        'An insufficient_evidence response must not carry an answer',
      );
    }

    return { ok: true, status: 'insufficient_evidence' };
  }

  if (typeof value.answer !== 'string') {
    return violation(
      'INVALID_ANSWER_TYPE',
      'An answered response must carry a string answer',
    );
  }

  const answer = value.answer.trim();

  if (answer.length === 0) {
    return violation('EMPTY_ANSWER', 'An answered response must not be empty');
  }

  const { markers, malformed } = parseCitationMarkers(answer);

  if (malformed.length > 0) {
    return violation(
      'MALFORMED_MARKER',
      `The answer contained a malformed citation marker: ${malformed.join(', ')}`,
    );
  }

  if (markers.length === 0) {
    return violation('NO_CITATIONS', 'An answered response must cite a source');
  }

  const unknown = markers.filter(
    (marker) => marker < 1 || marker > sources.length,
  );

  if (unknown.length > 0) {
    return violation(
      'UNKNOWN_SOURCE',
      `The answer cited a source that was not provided: ${unknown.join(', ')}`,
    );
  }

  return { ok: true, status: 'answered', answer, markers };
}

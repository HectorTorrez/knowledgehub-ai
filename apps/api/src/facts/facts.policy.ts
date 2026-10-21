import { createHash } from 'node:crypto';
import {
  AmountParseError,
  currencyScale,
  parseAmountText,
} from './amount.js';

export const MAX_FACT_EVIDENCE_CHARS = 500;

export const MAX_CONTRACT_ID_CHARS = 64;

export const MAX_FACT_LABEL_CHARS = 200;

export const MAX_FACTS_PER_DOCUMENT = 5000;

export interface ExtractedFactDraft {
  contractId: string;
  label: string;
  amountText: string;
  currency: string;
  evidenceText: string;
}

export interface FactCandidate {
  naturalKey: string;
  label: string;
  amountMinor: bigint;
  currency: string;
  pageNumber: number;
  evidenceText: string;
}

export type FactRejectionReason =
  | 'MISSING_EVIDENCE'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_TOO_LONG'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_NOT_IN_EVIDENCE'
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_CONTRACT_ID';

export type FactValidation =
  | { ok: true; fact: FactCandidate }
  | { ok: false; reason: FactRejectionReason };

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const MONEY_TOKEN_PATTERN = /[€£¥$]\s?\d[\d.,]*\d/g;

const CONTRACT_TOTAL_HEADER_PATTERN =
  /(monto\s+total|total\s+(del\s+)?(contrato|plan)|contract\s+total)/i;

export function hasContractTotalHeader(pageText: string): boolean {
  return CONTRACT_TOTAL_HEADER_PATTERN.test(normalizeWhitespace(pageText));
}

export function uncoveredMoneyTokens(
  pageText: string,
  evidenceTexts: string[],
): string[] {
  const page = normalizeWhitespace(pageText);
  const spans: Array<[number, number]> = [];

  for (const evidence of evidenceTexts) {
    if (evidence.length === 0) {
      continue;
    }

    let from = 0;

    while (from < page.length) {
      const index = page.indexOf(evidence, from);

      if (index < 0) {
        break;
      }

      spans.push([index, index + evidence.length]);
      from = index + evidence.length;
    }
  }

  const uncovered: string[] = [];

  for (const match of page.matchAll(MONEY_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const inside = spans.some(
      ([start, spanEnd]) => index >= start && end <= spanEnd,
    );

    if (!inside) {
      uncovered.push(match[0]);
    }
  }

  return uncovered;
}

export function moneyTokenContexts(
  pageText: string,
  tokens: string[],
  windowChars = 180,
): string[] {
  const page = normalizeWhitespace(pageText);
  const contexts: string[] = [];

  for (const token of tokens) {
    const index = page.indexOf(token);

    if (index < 0) {
      continue;
    }

    const start = Math.max(0, index - windowChars);
    const end = Math.min(page.length, index + token.length + windowChars);

    contexts.push(page.slice(start, end));
  }

  return contexts;
}

const CURRENCY_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
];

function inferCurrency(evidence: string): string | null {
  for (const [symbol, currency] of CURRENCY_SYMBOLS) {
    if (evidence.includes(symbol)) {
      return currency;
    }
  }

  return null;
}

function derivedKey(
  label: string,
  amountText: string,
  pageNumber: number,
): string {
  const digest = createHash('sha256')
    .update(`${label}|${amountText}|${pageNumber}`)
    .digest('hex')
    .slice(0, 32);

  return `derived:${digest}`;
}

export function validateFactDraft(
  draft: ExtractedFactDraft,
  pageContent: string,
  currencies: ReadonlySet<string>,
  pageNumber: number,
): FactValidation {
  const evidence = normalizeWhitespace(draft.evidenceText);

  if (evidence.length === 0) {
    return { ok: false, reason: 'MISSING_EVIDENCE' };
  }

  if (evidence.length > MAX_FACT_EVIDENCE_CHARS) {
    return { ok: false, reason: 'EVIDENCE_TOO_LONG' };
  }

  if (!normalizeWhitespace(pageContent).includes(evidence)) {
    return { ok: false, reason: 'EVIDENCE_NOT_FOUND' };
  }

  const rawCurrency = draft.currency.trim().toUpperCase();
  const currency = rawCurrency.length > 0 ? rawCurrency : inferCurrency(evidence);

  if (!currency || !currencies.has(currency)) {
    return { ok: false, reason: 'UNSUPPORTED_CURRENCY' };
  }

  const amountText = normalizeWhitespace(draft.amountText);

  if (amountText.length === 0 || !evidence.includes(amountText)) {
    return { ok: false, reason: 'AMOUNT_NOT_IN_EVIDENCE' };
  }

  let amountMinor: bigint;
  try {
    amountMinor = parseAmountText(amountText, currencyScale(currency));
  } catch (error) {
    if (error instanceof AmountParseError) {
      return { ok: false, reason: 'INVALID_AMOUNT' };
    }
    throw error;
  }

  const contractId = draft.contractId.trim();

  if (contractId.length > MAX_CONTRACT_ID_CHARS) {
    return { ok: false, reason: 'INVALID_CONTRACT_ID' };
  }

  const label = normalizeWhitespace(draft.label).slice(0, MAX_FACT_LABEL_CHARS);
  const naturalKey =
    contractId.length > 0
      ? contractId
      : derivedKey(label || amountText, amountText, pageNumber);

  return {
    ok: true,
    fact: {
      naturalKey,
      label: label.length > 0 ? label : naturalKey,
      amountMinor,
      currency,
      pageNumber,
      evidenceText: evidence,
    },
  };
}

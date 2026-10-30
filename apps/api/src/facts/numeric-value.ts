import { createHash } from 'node:crypto';
import type { NumericFactDraft } from './fact-extractor.port.js';
import {
  MAX_CONTRACT_ID_CHARS,
  MAX_FACT_EVIDENCE_CHARS,
  MAX_FACT_LABEL_CHARS,
  normalizeWhitespace,
} from './facts.policy.js';
import type { FactRecord } from './facts.store.js';

export function parseNumericText(
  text: string,
): { valueMinor: bigint; scale: number; percent: boolean } | null {
  let value = text.trim();
  const percent = value.endsWith('%');
  if (percent) value = value.slice(0, -1).trim();

  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1).trim();
  } else if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1).trim();
  }

  value = value.replace(/^(?:[A-Z]{3}|[$€£¥₹])\s*/, '');
  value = value.replace(/\s*(?:[A-Z]{3}|[$€£¥₹])$/, '');
  if (!/^[0-9][0-9., ]*$/.test(value)) return null;

  const dot = value.lastIndexOf('.');
  const comma = value.lastIndexOf(',');
  const last = Math.max(dot, comma);
  let decimal = -1;
  if (last >= 0) {
    const separator = value[last];
    const digits = value.length - last - 1;
    const occurrences = value.split(separator).length - 1;
    if (dot >= 0 && comma >= 0) {
      decimal = last;
    } else if (occurrences === 1 && digits !== 3) {
      decimal = last;
    }
  }

  const integer = decimal < 0 ? value : value.slice(0, decimal);
  const fraction = decimal < 0 ? '' : value.slice(decimal + 1);
  if (decimal >= 0 && !/^\d{1,6}$/.test(fraction)) return null;
  if (!/^\d+$/.test(integer)) {
    if (!/^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(integer)) return null;
    if (decimal >= 0 && integer.includes(value[decimal])) return null;
  }
  const digits = integer.replace(/[., ]/g, '') + fraction;
  const magnitude = BigInt(digits);
  return {
    valueMinor: negative ? -magnitude : magnitude,
    scale: fraction.length,
    percent,
  };
}

export function numericFactNaturalKey(input: {
  pageNumber: number;
  field: string;
  entityId: string;
  rowIndex: number;
  valueText: string;
}): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([
      input.pageNumber,
      input.field,
      input.entityId,
      input.rowIndex,
      input.valueText,
    ]))
    .digest('hex')
    .slice(0, 32);
  return `derived:${hash}`;
}

export function normalizeFieldName(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/, '');
}

function parseIsoDate(value: string): Date | null | undefined {
  if (value.length === 0) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return date.toISOString().slice(0, 10) === value ? date : undefined;
}

function exceedsLabelLimits(draft: NumericFactDraft, valueText: string): boolean {
  return (
    draft.entityId.length > MAX_CONTRACT_ID_CHARS ||
    [draft.fieldLabel, draft.entityLabel, draft.unit, valueText].some(
      (value) => value.length > MAX_FACT_LABEL_CHARS,
    )
  );
}

export function validateNumericDraft(
  draft: NumericFactDraft,
  pageText: string,
  currencies: ReadonlySet<string>,
  pageNumber: number,
  rowIndex: number,
): FactRecord | null {
  const evidence = normalizeWhitespace(draft.evidenceText);
  const valueText = normalizeWhitespace(draft.valueText);
  const field = normalizeFieldName(draft.field);
  const currency = draft.currency.trim().toUpperCase();
  const parsed = parseNumericText(valueText);
  const occurredOn = parseIsoDate(draft.date.trim());

  if (
    evidence.length === 0 ||
    evidence.length > MAX_FACT_EVIDENCE_CHARS ||
    !normalizeWhitespace(pageText).includes(evidence) ||
    valueText.length === 0 ||
    !evidence.includes(valueText) ||
    parsed === null ||
    field.length === 0 ||
    (currency.length > 0 && !currencies.has(currency)) ||
    occurredOn === undefined ||
    exceedsLabelLimits(draft, valueText)
  ) {
    return null;
  }

  return {
    factType: 'NUMERIC_VALUE',
    naturalKey: numericFactNaturalKey({
      pageNumber,
      field,
      entityId: draft.entityId,
      rowIndex,
      valueText,
    }),
    label: draft.fieldLabel || field,
    amountMinor: parsed.valueMinor,
    scale: parsed.scale,
    currency: currency || null,
    field,
    fieldLabel: draft.fieldLabel,
    unit: parsed.percent ? '%' : draft.unit,
    entityId: draft.entityId,
    entityLabel: draft.entityLabel,
    occurredOn,
    isTotal: draft.isTotal,
    pageNumber,
    evidenceText: evidence,
    chunkIndex: null,
  };
}

export type CalculationOperation =
  | 'sum' | 'average' | 'min' | 'max' | 'count' | 'difference' | 'percentage';

export interface CalculationPlan {
  operation: CalculationOperation;
  fields: string[];
  entityIds: string[];
  entityLabelContains: string | null;
  documentId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  currency: string | null;
  groupBy: 'none' | 'entity' | 'document' | 'month';
  includeTotals: boolean;
}

export interface NumericFactRow {
  id: string;
  documentId: string;
  documentTitle: string;
  field: string;
  fieldLabel: string;
  amountMinor: bigint;
  scale: number;
  currency: string | null;
  unit: string | null;
  entityId: string | null;
  entityLabel: string | null;
  occurredOn: Date | null;
  isTotal: boolean;
  pageNumber: number;
  chunkIndex: number | null;
  evidenceText: string;
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterFacts(rows: NumericFactRow[], plan: CalculationPlan) {
  return rows.filter((row) => {
    const date = row.occurredOn?.toISOString().slice(0, 10);
    return (plan.includeTotals || !row.isTotal) &&
      (!plan.entityIds.length || plan.entityIds.some(
        (id) => id.toLowerCase() === row.entityId?.toLowerCase(),
      )) &&
      (!plan.entityLabelContains || normalize(row.entityLabel ?? '').includes(
        normalize(plan.entityLabelContains),
      )) &&
      (!plan.dateFrom || (!!date && date >= plan.dateFrom)) &&
      (!plan.dateTo || (!!date && date <= plan.dateTo)) &&
      (!plan.currency || row.currency === plan.currency);
  });
}

type CalculationResult =
  | { status: 'empty' }
  | { status: 'unsupported'; reason: string }
  | { status: 'ok'; groups: Array<{
    key: string;
    currency: string | null;
    unit: string | null;
    valueMinor: bigint;
    scale: number;
    count: number;
    factIds: string[];
  }> };

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const result = (n + d / 2n) / d;
  return negative ? -result : result;
}

export function calculate(rows: NumericFactRow[], plan: CalculationPlan): CalculationResult {
  const filtered = filterFacts(rows, plan);
  if (!filtered.length) {
    return { status: 'empty' };
  }
  const buckets = new Map<string, NumericFactRow[]>();
  for (const row of filtered) {
    const dimension = plan.groupBy === 'entity' ? row.entityId ?? ''
      : plan.groupBy === 'document' ? row.documentId
        : plan.groupBy === 'month' ? row.occurredOn?.toISOString().slice(0, 7) ?? ''
          : '';
    const key = JSON.stringify([row.currency, row.currency ? null : row.unit, dimension]);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const groups: Extract<CalculationResult, { status: 'ok' }>['groups'] = [];
  for (const [key, facts] of buckets) {
    let scale = Math.max(...facts.map((row) => row.scale));
    const amount = (row: NumericFactRow) => row.amountMinor * 10n ** BigInt(scale - row.scale);
    const sum = (items: NumericFactRow[]) => items.reduce((total, row) => total + amount(row), 0n);
    let valueMinor = sum(facts);
    if (plan.operation === 'count') {
      valueMinor = BigInt(facts.length);
      scale = 0;
    } else if (plan.operation === 'average') {
      const target = Math.max(scale, 2);
      valueMinor = divideRounded(valueMinor * 10n ** BigInt(target - scale), BigInt(facts.length));
      scale = target;
    } else if (plan.operation === 'min' || plan.operation === 'max') {
      valueMinor = facts.map(amount).reduce((a, b) =>
        plan.operation === 'min' ? (a < b ? a : b) : (a > b ? a : b));
    } else if (plan.operation === 'difference' || plan.operation === 'percentage') {
      const byField = plan.fields.length === 2;
      if (!byField && (plan.operation === 'percentage' || plan.entityIds.length !== 2)) {
        return { status: 'unsupported', reason: 'Two fields or entities are required' };
      }
      const first = facts.filter((row) => byField ? row.field === plan.fields[0]
        : row.entityId?.toLowerCase() === plan.entityIds[0]?.toLowerCase());
      const second = facts.filter((row) => byField ? row.field === plan.fields[1]
        : row.entityId?.toLowerCase() === plan.entityIds[1]?.toLowerCase());
      if (!first.length || !second.length) {
        return { status: 'unsupported', reason: 'Both operands are required' };
      }
      const left = sum(first);
      const right = sum(second);
      if (plan.operation === 'percentage') {
        if (right === 0n) {
          return { status: 'unsupported', reason: 'Denominator is zero' };
        }
        valueMinor = divideRounded(left * 10000n, right);
        scale = 2;
      } else {
        valueMinor = left - right;
      }
    }
    const row = facts[0]!;
    groups.push({ key, currency: row.currency, unit: row.unit, valueMinor, scale,
      count: facts.length, factIds: facts.map((fact) => fact.id) });
  }
  return { status: 'ok', groups };
}

export function formatCalculationValue(
  valueMinor: bigint, scale: number, currency: string | null,
  unit: string | null, locale: string,
): string {
  const value = Number(valueMinor) / 10 ** scale;
  const formatted = new Intl.NumberFormat(locale, currency
    ? { style: 'currency', currency, minimumFractionDigits: scale, maximumFractionDigits: scale }
    : { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(value);
  return unit && !currency ? `${formatted} ${unit}` : formatted;
}

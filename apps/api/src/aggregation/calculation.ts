export type CalculationOperation =
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'count'
  | 'difference'
  | 'percentage';

export type CalculationGrouping = 'none' | 'entity' | 'document' | 'month';

export interface CalculationPlan {
  operation: CalculationOperation;
  fields: string[];
  entityIds: string[];
  entityLabelContains: string | null;
  documentId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  currency: string | null;
  groupBy: CalculationGrouping;
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

export interface CalculationGroup {
  key: string;
  currency: string | null;
  unit: string | null;
  valueMinor: bigint;
  scale: number;
  count: number;
  factIds: string[];
}

export type CalculationResult =
  | { status: 'empty' }
  | { status: 'unsupported'; reason: string }
  | { status: 'ok'; groups: CalculationGroup[] };

type GroupValue =
  | { valueMinor: bigint; scale: number }
  | { unsupported: string };

const PERCENT_SCALE = 2;

const MIN_AVERAGE_SCALE = 2;

function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function sameEntity(row: NumericFactRow, entityId: string | undefined): boolean {
  return (
    entityId !== undefined &&
    row.entityId?.toLowerCase() === entityId.toLowerCase()
  );
}

function withinDates(row: NumericFactRow, plan: CalculationPlan): boolean {
  const date = isoDate(row.occurredOn);

  if (plan.dateFrom && (!date || date < plan.dateFrom)) {
    return false;
  }

  return !plan.dateTo || (date !== null && date <= plan.dateTo);
}

export function filterFacts(
  rows: NumericFactRow[],
  plan: CalculationPlan,
): NumericFactRow[] {
  const labelNeedle = plan.entityLabelContains
    ? foldText(plan.entityLabelContains)
    : null;

  return rows.filter(
    (row) =>
      (plan.includeTotals || !row.isTotal) &&
      (plan.entityIds.length === 0 ||
        plan.entityIds.some((entityId) => sameEntity(row, entityId))) &&
      (labelNeedle === null ||
        foldText(row.entityLabel ?? '').includes(labelNeedle)) &&
      withinDates(row, plan) &&
      (!plan.currency || row.currency === plan.currency),
  );
}

function groupDimension(row: NumericFactRow, groupBy: CalculationGrouping) {
  switch (groupBy) {
    case 'entity':
      return row.entityId ?? '';
    case 'document':
      return row.documentId;
    case 'month':
      return isoDate(row.occurredOn)?.slice(0, 7) ?? '';
    case 'none':
      return '';
  }
}

function bucketKey(row: NumericFactRow, groupBy: CalculationGrouping): string {
  return JSON.stringify([
    row.currency,
    row.currency ? null : row.unit,
    groupDimension(row, groupBy),
  ]);
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const divisor = denominator < 0n ? -denominator : denominator;
  const quotient = (magnitude + divisor / 2n) / divisor;

  return negative ? -quotient : quotient;
}

function rescale(row: NumericFactRow, scale: number): bigint {
  return row.amountMinor * 10n ** BigInt(scale - row.scale);
}

function sumAt(rows: NumericFactRow[], scale: number): bigint {
  return rows.reduce((total, row) => total + rescale(row, scale), 0n);
}

function splitOperands(
  rows: NumericFactRow[],
  plan: CalculationPlan,
): [NumericFactRow[], NumericFactRow[]] | null {
  if (plan.fields.length === 2) {
    return [
      rows.filter((row) => row.field === plan.fields[0]),
      rows.filter((row) => row.field === plan.fields[1]),
    ];
  }

  if (plan.operation === 'difference' && plan.entityIds.length === 2) {
    return [
      rows.filter((row) => sameEntity(row, plan.entityIds[0])),
      rows.filter((row) => sameEntity(row, plan.entityIds[1])),
    ];
  }

  return null;
}

function compareOperands(
  rows: NumericFactRow[],
  plan: CalculationPlan,
  scale: number,
): GroupValue {
  const operands = splitOperands(rows, plan);

  if (!operands) {
    return { unsupported: 'Two fields or entities are required' };
  }

  const [first, second] = operands;

  if (first.length === 0 || second.length === 0) {
    return { unsupported: 'Both operands are required' };
  }

  const left = sumAt(first, scale);
  const right = sumAt(second, scale);

  if (plan.operation === 'difference') {
    return { valueMinor: left - right, scale };
  }

  if (right === 0n) {
    return { unsupported: 'Denominator is zero' };
  }

  return {
    valueMinor: divideRounded(left * 100n * 10n ** BigInt(PERCENT_SCALE), right),
    scale: PERCENT_SCALE,
  };
}

function groupValue(rows: NumericFactRow[], plan: CalculationPlan): GroupValue {
  const scale = Math.max(...rows.map((row) => row.scale));
  const values = rows.map((row) => rescale(row, scale));

  switch (plan.operation) {
    case 'sum':
      return { valueMinor: sumAt(rows, scale), scale };
    case 'count':
      return { valueMinor: BigInt(rows.length), scale: 0 };
    case 'average': {
      const target = Math.max(scale, MIN_AVERAGE_SCALE);

      return {
        valueMinor: divideRounded(
          sumAt(rows, scale) * 10n ** BigInt(target - scale),
          BigInt(rows.length),
        ),
        scale: target,
      };
    }
    case 'min':
      return {
        valueMinor: values.reduce((low, value) => (value < low ? value : low)),
        scale,
      };
    case 'max':
      return {
        valueMinor: values.reduce((high, value) => (value > high ? value : high)),
        scale,
      };
    case 'difference':
    case 'percentage':
      return compareOperands(rows, plan, scale);
  }
}

export function calculate(
  rows: NumericFactRow[],
  plan: CalculationPlan,
): CalculationResult {
  const filtered = filterFacts(rows, plan);

  if (filtered.length === 0) {
    return { status: 'empty' };
  }

  const buckets = new Map<string, NumericFactRow[]>();

  for (const row of filtered) {
    const key = bucketKey(row, plan.groupBy);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const groups: CalculationGroup[] = [];

  for (const [key, facts] of buckets) {
    const value = groupValue(facts, plan);

    if ('unsupported' in value) {
      return { status: 'unsupported', reason: value.unsupported };
    }

    const [first] = facts;

    groups.push({
      key,
      currency: first?.currency ?? null,
      unit: first?.unit ?? null,
      valueMinor: value.valueMinor,
      scale: value.scale,
      count: facts.length,
      factIds: facts.map((fact) => fact.id),
    });
  }

  return { status: 'ok', groups };
}

export function formatCalculationValue(
  valueMinor: bigint,
  scale: number,
  currency: string | null,
  unit: string | null,
  locale: string,
): string {
  const value = Number(valueMinor) / 10 ** scale;
  const digits = { minimumFractionDigits: scale, maximumFractionDigits: scale };
  const formatted = new Intl.NumberFormat(
    locale,
    currency ? { ...digits, style: 'currency', currency } : digits,
  ).format(value);

  return unit && !currency ? `${formatted} ${unit}` : formatted;
}

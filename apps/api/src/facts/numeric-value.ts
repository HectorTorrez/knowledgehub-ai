import { createHash } from 'node:crypto';

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

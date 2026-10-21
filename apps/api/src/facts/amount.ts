export class AmountParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountParseError';
  }
}

const MAX_AMOUNT_MINOR = 10n ** 18n;

const CURRENCY_SCALES: Readonly<Record<string, number>> = {
  BHD: 3,
  EUR: 2,
  GBP: 2,
  GTQ: 2,
  HNL: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MXN: 2,
  OMR: 3,
  TND: 3,
  USD: 2,
};

export const DEFAULT_CURRENCY_SCALE = 2;

export function currencyScale(currency: string): number {
  return CURRENCY_SCALES[currency.toUpperCase()] ?? DEFAULT_CURRENCY_SCALE;
}

function fractionDigitsAfter(value: string, separator: string): number {
  const index = value.lastIndexOf(separator);
  return index < 0 ? 0 : value.length - index - 1;
}

function decimalSeparatorOf(value: string): string | null {
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot ? ',' : '.';
  }

  if (lastComma >= 0) {
    return fractionDigitsAfter(value, ',') <= 2 ? ',' : null;
  }

  if (lastDot >= 0) {
    return fractionDigitsAfter(value, '.') <= 2 ? '.' : null;
  }

  return null;
}

export function parseAmountText(raw: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 3) {
    throw new AmountParseError(`Unsupported amount scale: ${scale}`);
  }

  const text = raw.trim();

  if (text.length === 0) {
    throw new AmountParseError('The amount text is empty');
  }

  const negative = text.startsWith('-') || /^\(.*\)$/.test(text);
  const compact = text.replace(/[^\d.,-]/g, '').replace(/-/g, '');

  if (!/\d/.test(compact)) {
    throw new AmountParseError(`The amount text has no digits: ${raw}`);
  }

  const separator = decimalSeparatorOf(compact);
  let integerDigits: string;
  let fractionDigits: string;

  if (separator) {
    const index = compact.lastIndexOf(separator);
    integerDigits = compact.slice(0, index).replace(/[.,]/g, '');
    fractionDigits = compact.slice(index + 1).replace(/[.,]/g, '');
  } else {
    integerDigits = compact.replace(/[.,]/g, '');
    fractionDigits = '';
  }

  if (!/^\d+$/.test(integerDigits) || !/^\d*$/.test(fractionDigits)) {
    throw new AmountParseError(`The amount text is malformed: ${raw}`);
  }

  if (fractionDigits.length > scale) {
    const excess = fractionDigits.slice(scale);

    if (/[^0]/.test(excess)) {
      throw new AmountParseError(
        `The amount text has more precision than ${scale} decimals: ${raw}`,
      );
    }

    fractionDigits = fractionDigits.slice(0, scale);
  }

  const padded = fractionDigits.padEnd(scale, '0');
  const minor =
    BigInt(integerDigits) * 10n ** BigInt(scale) + (padded ? BigInt(padded) : 0n);

  if (minor > MAX_AMOUNT_MINOR) {
    throw new AmountParseError('The amount is out of range');
  }

  return negative ? -minor : minor;
}

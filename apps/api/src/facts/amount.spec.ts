import { describe, expect, it } from 'vitest';
import {
  AmountParseError,
  currencyScale,
  parseAmountText,
} from './amount.js';

describe('currencyScale', () => {
  it('uses two decimals for USD and zero for JPY', () => {
    expect(currencyScale('USD')).toBe(2);
    expect(currencyScale('usd')).toBe(2);
    expect(currencyScale('JPY')).toBe(0);
    expect(currencyScale('KWD')).toBe(3);
  });

  it('falls back to two decimals for an unknown currency', () => {
    expect(currencyScale('XYZ')).toBe(2);
  });
});

describe('parseAmountText', () => {
  it('parses a US formatted amount with a symbol and thousands', () => {
    expect(parseAmountText('$1,084.80', 2)).toBe(108480n);
  });

  it('parses a European formatted amount', () => {
    expect(parseAmountText('1.084,80', 2)).toBe(108480n);
  });

  it('treats a single separator with three digits as thousands', () => {
    expect(parseAmountText('$1,084', 2)).toBe(108400n);
    expect(parseAmountText('1.084', 2)).toBe(108400n);
    expect(parseAmountText('$1.500', 2)).toBe(150000n);
  });

  it('pads a whole amount to the currency scale', () => {
    expect(parseAmountText('$500', 2)).toBe(50000n);
    expect(parseAmountText('7', 2)).toBe(700n);
  });

  it('parses parentheses as a negative amount', () => {
    expect(parseAmountText('($1,000.50)', 2)).toBe(-100050n);
  });

  it('parses a leading minus sign', () => {
    expect(parseAmountText('-$7.00', 2)).toBe(-700n);
  });

  it('honors a zero-decimal currency', () => {
    expect(parseAmountText('¥1,200', 0)).toBe(1200n);
  });

  it('keeps trailing zeros that are part of the scale', () => {
    expect(parseAmountText('$1.10', 2)).toBe(110n);
  });

  it('rejects meaningful precision beyond the currency scale', () => {
    expect(() => parseAmountText('1.5', 0)).toThrow(AmountParseError);
  });

  it('rejects text without digits', () => {
    expect(() => parseAmountText('n/a', 2)).toThrow(AmountParseError);
    expect(() => parseAmountText('', 2)).toThrow(AmountParseError);
  });

  it('rejects an out of range amount', () => {
    expect(() => parseAmountText('$9,999,999,999,999,999,999', 2)).toThrow(
      AmountParseError,
    );
  });
});

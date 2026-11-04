import { describe, expect, it } from 'vitest';
import { en } from './messages/en';
import { es } from './messages/es';
import {
  resolveMessage,
  interpolate,
  createTranslator,
  MESSAGES,
} from './translate';
import type { Messages } from './messages/schema';

function leafKeys(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : leafKeys(value, `${prefix}${key}.`),
  );
}

describe('message catalogs', () => {
  it('have identical keys in English and Spanish', () => {
    expect(leafKeys(es).sort()).toEqual(leafKeys(en).sort());
  });

  it('have no empty translations', () => {
    for (const key of leafKeys(es)) {
      const value = key
        .split('.')
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          es,
        );
      expect(value, key).not.toBe('');
    }
  });
});

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(
      interpolate('Hello {name}, {count} new', { name: 'Ana', count: 3 }),
    ).toBe('Hello Ana, 3 new');
  });

  it('keeps placeholders that have no value', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
  });

  it('does not treat missing params as the string "undefined"', () => {
    expect(interpolate('{toString}', {})).toBe('{toString}');
  });
});

describe('plural resolution', () => {
  const messages = {
    documents: {
      count_one: '{count} document',
      count_other: '{count} documents',
    },
  } as unknown as Messages;

  it('selects the singular form for one in English', () => {
    expect(
      resolveMessage(messages, 'en', 'documents.count', { count: 1 }),
    ).toBe('1 document');
  });

  it('selects the plural form for other counts in English', () => {
    expect(
      resolveMessage(messages, 'en', 'documents.count', { count: 0 }),
    ).toBe('0 documents');
  });

  it('falls back to the other form when a category is missing', () => {
    expect(
      resolveMessage(messages, 'es', 'documents.count', { count: 5 }),
    ).toBe('5 documents');
  });
});

describe('createTranslator', () => {
  it('translates a key in the requested locale', () => {
    expect(createTranslator('en')('common.save')).toBe('Save');
    expect(createTranslator('es')('common.save')).toBe(MESSAGES.es.common.save);
  });

  it('interpolates parameters through the translator', () => {
    const t = createTranslator('en');
    expect(t('commandPalette.askQuestion', { text: 'refunds' })).toBe(
      'Ask a question… refunds',
    );
  });
});

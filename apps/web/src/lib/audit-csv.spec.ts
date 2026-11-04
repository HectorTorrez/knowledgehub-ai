import { describe, expect, it } from 'vitest';
import { auditCsv } from './audit-csv';
import { createTranslator } from '~/lib/i18n/translate';

describe('auditCsv', () => {
  it('escapes quotes, commas, and line breaks', () => {
    expect(
      auditCsv(
        [
          {
            id: '1',
            createdAt: '2026-01-01',
            action: 'DOCUMENT_DELETED',
            actor: null,
            targetType: 'document',
            targetId: 'a,"b"\nc',
            metadata: {},
          },
        ],
        createTranslator('en'),
        'en',
      ),
    ).toContain('"document: a,""b""\nc"');
  });
});

import { describe, expect, it } from 'vitest';
import {
  decodeListCursor,
  encodeListCursor,
  listCursorFilter,
} from './list-cursor.js';

const CURSOR = { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: 'doc-9' };

describe('list cursor', () => {
  it('round-trips through an opaque string', () => {
    const encoded = encodeListCursor(CURSOR);
    expect(decodeListCursor(encoded)).toEqual(CURSOR);
  });

  it('encodes as a URL-safe, non-JSON token', () => {
    const encoded = encodeListCursor(CURSOR);
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('+');
  });

  it('returns null for a malformed token', () => {
    expect(decodeListCursor('not-a-token')).toBeNull();
    expect(decodeListCursor(Buffer.from('{"id":"x"}').toString('base64url'))).toBeNull();
    expect(
      decodeListCursor(
        Buffer.from('{"createdAt":"not-a-date","id":"x"}').toString('base64url'),
      ),
    ).toBeNull();
  });

  it('builds a keyset filter that continues the descending order', () => {
    expect(listCursorFilter(CURSOR)).toEqual({
      OR: [
        { createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          id: { lt: 'doc-9' },
        },
      ],
    });
  });
});

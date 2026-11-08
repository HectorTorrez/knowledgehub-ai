import type { DocumentDetailResponse } from '@knowledgehub/shared-types';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api/errors';
import { decideDocumentNotifications } from './document-notifications';

function result(
  id: string,
  status: 'READY' | 'FAILED' | 'PROCESSING',
  failureReason?: string,
): PromiseFulfilledResult<DocumentDetailResponse> {
  return {
    status: 'fulfilled',
    value: {
      document: { id, title: id, status, failureReason },
    } as DocumentDetailResponse,
  };
}

describe('notification polling decisions', () => {
  it('returns ready documents in a batch', () => {
    const decision = decideDocumentNotifications(
      ['a', 'b', 'c'],
      [result('a', 'READY'), result('b', 'READY'), result('c', 'READY')],
    );
    expect(decision.ready.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(decision.stillPending).toEqual([]);
  });
  it('preserves failure reasons and pending documents and removes missing documents', () => {
    const decision = decideDocumentNotifications(
      ['a', 'b', 'c'],
      [
        result('a', 'FAILED', 'INVALID_FILE'),
        result('b', 'PROCESSING'),
        {
          status: 'rejected',
          reason: new ApiError({ status: 404, message: 'missing' }),
        },
      ],
    );
    expect(decision.failed[0]?.failureReason).toBe('INVALID_FILE');
    expect(decision.removed).toEqual(['c']);
    expect(decision.stillPending).toEqual(['b']);
  });
  it('has nothing to poll for empty pending', () => {
    expect(decideDocumentNotifications([], [])).toEqual({
      ready: [],
      failed: [],
      removed: [],
      stillPending: [],
    });
  });
});

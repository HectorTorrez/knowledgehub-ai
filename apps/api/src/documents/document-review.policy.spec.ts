import { describe, expect, it } from 'vitest';
import { isReviewOverdue } from './document-review.policy.js';
import { updateDocumentReviewSchema } from './dto/update-document-review.schema.js';

describe('document reviews', () => {
  it('treats the entire due date as available for review in UTC', () => {
    const now = new Date('2026-11-10T23:59:59Z');
    expect(isReviewOverdue(new Date('2026-11-10T00:00:00Z'), now)).toBe(false);
    expect(isReviewOverdue(new Date('2026-11-09T00:00:00Z'), now)).toBe(true);
    expect(isReviewOverdue(new Date('2026-11-11T00:00:00Z'), now)).toBe(false);
    expect(isReviewOverdue(null, now)).toBe(false);
  });
  it('rejects invalid calendar dates and client supplied review timestamps', () => {
    expect(
      updateDocumentReviewSchema.safeParse({
        ownerId: null,
        dueDate: '2026-02-30',
      }).success,
    ).toBe(false);
    expect(
      updateDocumentReviewSchema.safeParse({
        ownerId: null,
        dueDate: null,
        lastReviewedAt: '2026-11-10T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

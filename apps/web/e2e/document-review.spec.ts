import { expect, test } from '@playwright/test';
import type { DocumentReview } from '@knowledgehub/shared-types';
import { mockApi } from './mock-api';

test('assigns document ownership, schedules a review, and marks it reviewed', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  const date = '2026-11-10T00:00:00.000Z';
  let review: DocumentReview | undefined;
  let updatedAt = date;
  const document = () => ({
    id: 'doc-1',
    title: 'Handbook',
    generation: 1,
    collections: [],
    sourceUrl: null,
    status: 'READY',
    processingStage: 'READY',
    retry: null,
    originalFileName: 'handbook.pdf',
    contentType: 'application/pdf',
    sizeBytes: 100,
    failureReason: null,
    failureKind: null,
    createdAt: date,
    updatedAt,
    review,
  });
  await page.route(
    'http://localhost:3001/organizations/org-1/documents/doc-1',
    (route) => route.fulfill({ json: { document: document() } }),
  );
  await page.route('**/organizations/org-1/documents/doc-1/review', (route) => {
    const body = route.request().postDataJSON();
    review = {
      owner: body.ownerId
        ? { userId: body.ownerId, firstName: 'Ada', lastName: 'Lovelace' }
        : null,
      dueDate: body.markReviewed ? null : body.dueDate,
      overdue: !body.markReviewed && !!body.dueDate,
      lastReviewedAt: body.markReviewed ? date : null,
    };
    updatedAt = new Date().toISOString();
    return route.fulfill({ json: { document: document() } });
  });
  await page.goto('/organizations/org-1/documents/doc-1');
  await page
    .getByLabel('Document owner', { exact: true })
    .selectOption('user-1');
  await page
    .getByLabel('Review date (UTC)', { exact: true })
    .fill('2000-01-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Review overdue', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Mark reviewed', exact: true })
    .click();
  await expect(page.getByText(/Last reviewed:/)).toBeVisible();
  await expect(page.getByText('Review overdue', { exact: true })).toHaveCount(
    0,
  );
  expect(review?.owner?.userId).toBe('user-1');
  expect(review?.dueDate).toBeNull();
});

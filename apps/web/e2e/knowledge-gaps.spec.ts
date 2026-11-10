import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('track, assign, and resolve an unanswered question', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  let tasks: Array<Record<string, unknown>> = [];
  await page.route('**/organizations/org-1/insights?*', (route) =>
    route.fulfill({
      json: {
        totals: {
          questionsAsked: 1,
          answered: 0,
          insufficientEvidence: 1,
          helpfulFeedback: 0,
          unhelpfulFeedback: 0,
        },
        unansweredQuestions: [
          {
            answerId: 'answer-1',
            question: 'Who owns releases?',
            askedAt: '2026-11-10T00:00:00.000Z',
            conversationId: null,
          },
        ],
        negativeFeedback: [],
      },
    }),
  );
  await page.route('**/organizations/org-1/knowledge-gaps**', async (route) => {
    if (route.request().method() === 'PUT') {
      tasks = [
        {
          id: 'gap-1',
          answerId: 'answer-1',
          question: 'Who owns releases?',
          ...route.request().postDataJSON(),
          updatedAt: new Date().toISOString(),
        },
      ];
      await route.fulfill({ status: 204 });
    } else await route.fulfill({ json: { tasks } });
  });
  await page.goto('/organizations/org-1/insights');
  await page.getByRole('button', { name: 'Track knowledge gap' }).click();
  await expect(page.getByRole('button', { name: 'Tracked' })).toBeDisabled();
  await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED');
  await page.getByLabel('Owner', { exact: true }).selectOption('user-1');
  await page
    .getByLabel('Resolving document', { exact: true })
    .selectOption('doc-1');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'View resolving document' }),
  ).toBeVisible();
  expect(tasks[0]).toMatchObject({
    status: 'RESOLVED',
    assigneeId: 'user-1',
    documentId: 'doc-1',
  });
});

import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('filters grouped search results and expands matches', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  let query = '';
  await page.route('http://localhost:3001/organizations/org-1/search*', async (route) => {
    query = route.request().url();
    await route.fulfill({ json: { results: [{ documentId: 'doc-1', documentTitle: 'Handbook', score: 0.9, matchCount: 2, matches: [ { excerpt: 'Paid leave', pageNumber: 1, chunkIndex: 0, highlights: [{ start: 5, end: 10 }] }, { excerpt: 'More leave', pageNumber: 2, chunkIndex: 1, highlights: [] } ] }] } });
  });
  await page.goto('/organizations/org-1/search');
  await page.getByLabel('Handbook').check();
  await page.getByLabel('Created after').fill('2026-01-01');
  await page.getByLabel('Search query').fill('leave');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('mark')).toHaveText('leave');
  expect(new URL(query).searchParams.get('documentIds')).toBe('doc-1');
  expect(new URL(query).searchParams.get('createdAfter')).toBe('2026-01-01');
  await page.getByRole('button', { name: '+1 more matches' }).click();
  await expect(page.getByText('More leave')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Handbook')).not.toBeChecked();
});

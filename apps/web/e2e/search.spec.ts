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
  const documentFilter = page.getByRole('combobox', { name: 'Documents' });
  await documentFilter.click();
  await page.getByRole('option', { name: 'Handbook' }).click();
  await expect(page.getByRole('option', { name: 'Handbook' })).toHaveAttribute('data-checked', 'true');
  await page.keyboard.press('Escape');
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Created after').click();
  await page.locator(`td[data-day="${todayIso}"] button`).click();
  await page.getByLabel('Search query').fill('leave');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('mark')).toHaveText('leave');
  expect(new URL(query).searchParams.get('documentIds')).toBe('doc-1');
  expect(new URL(query).searchParams.get('createdAfter')).toBe(todayIso);
  await page.getByRole('button', { name: '+1 more matches' }).click();
  await expect(page.getByText('More leave')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(documentFilter).toHaveText(/All ready documents/);
  await documentFilter.click();
  await expect(page.getByRole('option', { name: 'Handbook' })).toHaveAttribute('data-checked', 'false');
});

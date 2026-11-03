import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 844 });
  }
});

test('empty documents offer an upload to owners', async ({ page }) => {
  await mockApi(page, { authenticated: true, emptyResources: ['documents'] });
  await page.goto('/organizations/org-1/documents');
  await expect(
    page.getByRole('heading', { name: 'No documents yet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload your first document' }),
  ).toBeVisible();
});

test('empty documents explain the next step to viewers', async ({ page }) => {
  await mockApi(page, {
    authenticated: true,
    role: 'VIEWER',
    emptyResources: ['documents'],
  });
  await page.goto('/organizations/org-1/documents');
  await expect(
    page.getByText('Ask an admin to upload documents.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload your first document' }),
  ).toHaveCount(0);
});

test('search offers to clear filters when there are no results', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true, emptyResources: ['search'] });
  await page.goto('/organizations/org-1/search');
  await page.getByLabel('Search query').fill('nothing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No results' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
});

test('empty conversations show example questions', async ({ page }) => {
  await mockApi(page, {
    authenticated: true,
    emptyResources: ['conversations'],
  });
  await page.goto('/organizations/org-1/ask');
  await expect(page.getByText('Try asking')).toBeVisible();
});

test('empty audit activity offers clear filters', async ({ page }) => {
  await mockApi(page, { authenticated: true, emptyResources: ['activity'] });
  await page.goto('/organizations/org-1/audit-log');
  await expect(page.getByText('No activity found.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
});

test('a failed document request can be retried', async ({ page }) => {
  const failingResources: Array<'documents'> = ['documents'];
  await mockApi(page, { authenticated: true, failingResources });
  await page.goto('/organizations/org-1/documents');
  await expect(
    page.getByRole('heading', { name: 'Unable to load documents' }),
  ).toBeVisible({ timeout: 20000 });
  failingResources.length = 0;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('link', { name: /Handbook/ }).first(),
  ).toBeVisible();
});

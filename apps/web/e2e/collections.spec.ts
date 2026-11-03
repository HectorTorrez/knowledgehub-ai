import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('creates, assigns, filters and asks with a collection', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await page.getByRole('button', { name: 'Manage collections' }).click();
  await page.getByLabel('Collection name').fill('Policies');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await expect(page.getByText('Policies').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: /Handbook/ }).click();
  await page.getByRole('combobox', { name: 'Collections' }).click();
  await page.getByRole('option', { name: 'Policies' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Policies').first()).toBeVisible();
  await page.goto('/organizations/org-1/documents');
  await page.getByRole('combobox', { name: 'Filter by collection' }).click();
  await page.getByRole('option', { name: 'Policies' }).click();
  await expect(page.getByRole('link', { name: /Handbook/ })).toBeVisible();
  await page.goto('/organizations/org-1/ask');
  await page.getByRole('combobox', { name: 'Answer from' }).click();
  await page.getByRole('option', { name: 'Policies' }).click();
  await page.getByLabel('Your question').fill('What is the policy?');
  const request = page.waitForRequest(
    (entry) => entry.url().endsWith('/answers') && entry.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  expect((await request).postDataJSON().collectionIds).toEqual([
    'collection-1',
  ]);
});

test('viewers cannot manage or assign collections', async ({ page }) => {
  await mockApi(page, { authenticated: true, role: 'VIEWER' });
  await page.goto('/organizations/org-1/documents');
  await expect(
    page.getByRole('button', { name: 'Manage collections' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: /Handbook/ }).click();
  await expect(page.getByRole('combobox', { name: 'Collections' })).toHaveCount(
    0,
  );
});

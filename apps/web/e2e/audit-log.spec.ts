import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('owner filters, loads more and exports activity', async ({ page }) => {
  await mockApi(page, { authenticated: true, auditPages: true });
  await page.goto('/organizations/org-1/audit-log');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByRole('link', { name: 'Audit log' })).toBeVisible();
  if (test.info().project.name === 'mobile')
    await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Document uploaded' }).click();
  await page.getByLabel('Actor', { exact: true }).click();
  await page
    .getByRole('option', { name: 'Ada Lovelace (ada@example.test)' })
    .click();
  await expect(page.getByText('Handbook')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.getByText('Handbook')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^audit-log-Acme-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await page.getByLabel('Action', { exact: true }).click();
  await page.getByRole('option', { name: 'Document deleted' }).click();
  await expect(page.getByText('No activity found.')).toBeVisible();
});

test('viewer cannot access audit log', async ({ page }) => {
  await mockApi(page, { authenticated: true, role: 'VIEWER' });
  await page.goto('/organizations/org-1/audit-log');
  await expect(
    page.getByRole('heading', { name: 'Not allowed' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
});

test('security page describes workspace protections', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/security');
  await expect(
    page.getByRole('heading', { name: 'Security that runs on every request' }),
  ).toBeVisible();
  await expect(page.getByText(/sends those passages to OpenAI/)).toBeVisible();
});

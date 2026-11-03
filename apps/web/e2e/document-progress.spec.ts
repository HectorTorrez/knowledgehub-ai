import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('shows processing progress and a ready notification', async ({ page }) => {
  await mockApi(page, { authenticated: true, progress: 'ready-after-poll' });
  await page.goto('/organizations/org-1/documents/doc-1');
  await expect(
    page.getByRole('list', { name: 'Processing stages' }),
  ).toContainText('Processing');
  const notifications = page.getByRole('list', { name: 'Notifications' });
  await expect(notifications.getByText('Handbook is ready')).toBeVisible({
    timeout: 10000,
  });
  await expect(
    notifications.getByRole('button', { name: 'Ask about it' }),
  ).toBeVisible();
  await expect(
    notifications.getByRole('button', { name: 'View' }),
  ).toBeVisible();
});

test('gates failure actions by capability', async ({ page }) => {
  await mockApi(page, {
    authenticated: true,
    progress: 'failed',
    role: 'VIEWER',
  });
  await page.goto('/organizations/org-1/documents/doc-1');
  await expect(page.getByText(/file/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reprocess' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Upload again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('offers failure actions to an owner', async ({ page }) => {
  await mockApi(page, { authenticated: true, progress: 'failed' });
  await page.goto('/organizations/org-1/documents/doc-1');
  await expect(page.getByRole('button', { name: 'Reprocess' })).toBeVisible();
  await page.getByRole('link', { name: 'Upload again' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

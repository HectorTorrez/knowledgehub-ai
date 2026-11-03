import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('downloads personal data', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^knowledgehub-export-\d{4}-\d{2}-\d{2}\.json$/,
  );
});

test('deletes the account', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete account' })
    .click();
  await expect(page).toHaveURL('/');
});

test('lists organizations blocking deletion', async ({ page }) => {
  await mockApi(page, { authenticated: true, deletionBlocked: true });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete account' })
    .click();
  await expect(
    page.getByRole('alertdialog').getByRole('link', { name: 'Acme' }),
  ).toHaveAttribute('href', '/organizations/org-1/settings');
});

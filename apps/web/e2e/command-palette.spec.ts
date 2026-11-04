import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('opens from an input, navigates, switches organizations and prefills Ask', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder('Search or type a command…')
    .fill('Account settings');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search or type a command…').fill('Beta');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/organizations\/org-2$/);
  await page.goto('/organizations/org-1');
  await expect(page.getByRole('button', { name: /Search…/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page
    .getByPlaceholder('Search or type a command…')
    .fill('What is the policy?');
  await page.getByRole('option', { name: /Ask a question/ }).click();
  await expect(page).toHaveURL(/\/ask/);
  await expect(page.getByRole('textbox', { name: /question/i })).toHaveValue(
    'What is the policy?',
  );
});

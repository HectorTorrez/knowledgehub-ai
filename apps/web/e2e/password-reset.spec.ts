import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

const NEW_PASSWORD = 'a brand new passphrase';

test('requests a reset link from the sign-in page', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();

  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Email').fill('ada@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByText('Check your inbox')).toBeVisible();
  await expect(page.getByText('ada@example.test')).toBeVisible();
});

test('sets a new password from the emailed link', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/reset-password?token=valid-token');

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByText('Password changed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('explains an expired or used reset link', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/reset-password?token=used-token');

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByText('This link no longer works')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Request a new link' }),
  ).toBeVisible();
});

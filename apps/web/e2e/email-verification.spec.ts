import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('confirms the email from the emailed link', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/verify-email?token=valid-token');
  await expect(page.getByText('Email confirmed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
});

test('explains an expired or used link', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/verify-email?token=used-token');
  await expect(page.getByText('This link no longer works')).toBeVisible();
});

test('unverified users see a banner that resends the email', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true, unverified: true });
  await page.goto('/organizations/org-1');
  await expect(
    page.getByText('Confirm ada@example.test to join organizations'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resend email' }).click();
  await expect(page.getByText('Confirmation email sent')).toBeVisible();
});

test('unverified users must confirm before accepting an invitation', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true, unverified: true });
  await page.goto('/invitations/accept?token=invite-token');
  await expect(page.getByText('Confirm your email first')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept invitation' }),
  ).toHaveCount(0);
});

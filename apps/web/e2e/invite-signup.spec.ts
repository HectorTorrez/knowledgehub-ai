import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('tells an invitee without an account that it will be created, then creates it', async ({
  page,
}) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/invite?token=new-invite');

  await expect(page.getByText('Join Acme', { exact: true })).toBeVisible();
  await expect(
    page.getByText('We will create your account automatically'),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('grace@example.test');

  await page.getByLabel('First name').fill('Grace');
  await page.getByLabel('Last name').fill('Hopper');
  await page.getByLabel('Choose a password').fill('correct horse battery');
  await page
    .getByRole('button', { name: 'Create my account and join' })
    .click();

  await expect(page.getByText('Your account is ready')).toBeVisible();
  await expect(page).toHaveURL(/\/organizations\/org-1$/);
});

test('asks an invitee who already has an account to sign in', async ({
  page,
}) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/invite?token=existing-invite');

  await expect(page.getByText('Sign in to join Acme')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in to accept' }),
  ).toHaveAttribute('href', /\/login\?redirect=.*invitations.*existing-invite/);
});

test('explains an expired or used invitation', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto('/invite?token=used-invite');

  await expect(page.getByText('This invitation no longer works')).toBeVisible();
});

test('sends a signed-in visitor to the accept page', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/invite?token=new-invite');

  await expect(page).toHaveURL(/\/invitations\/accept\?token=new-invite$/);
  await expect(
    page.getByRole('button', { name: 'Accept invitation' }),
  ).toBeVisible();
});

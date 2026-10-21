import { expect, test } from '@playwright/test';
import { USER, mockApi } from './mock-api';

test('redirects a signed-out visitor to the login page', async ({ page }) => {
  await mockApi(page, { authenticated: false });

  await page.goto('/organizations');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('signs in and browses an organization', async ({ page }) => {
  await mockApi(page, { authenticated: false });

  await page.goto('/login');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByRole('textbox', { name: 'Password' }).fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
  await expect(page.getByText('Acme')).toBeVisible();

  await page.getByRole('link', { name: /Acme/ }).first().click();

  await expect(page.getByRole('heading', { name: 'Acme' })).toBeVisible();
  await expect(page.getByText('Daily answer usage', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 100 answers')).toBeVisible();

  await page.getByRole('link', { name: 'Documents' }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Handbook' })).toBeVisible();

  await page.getByLabel('Search documents').fill('handbook');
  await expect(page.getByRole('link', { name: 'Handbook' })).toBeVisible();

  await page.getByLabel('Filter by status').click();
  await page.getByRole('option', { name: 'Failed' }).click();
  await expect(page.getByRole('heading', { name: 'No matching documents' })).toBeVisible();
});

test('asks a question and renders the streamed answer with its source', async ({ page }) => {
  let asked = false;
  await mockApi(page, {
    authenticated: true,
    onAsk: () => {
      asked = true;
    },
  });

  await page.goto('/organizations/org-1/ask');
  await expect(page.getByRole('heading', { name: 'Ask a question' })).toBeVisible();

  await page.getByLabel('Your question').fill('How much leave do I get?');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect.poll(() => asked).toBe(true);
  await expect(page.getByText('You get twenty days')).toBeVisible();

  await page.getByRole('button', { name: /Sources/ }).first().click();
  await expect(page.getByRole('link', { name: 'Handbook' })).toBeVisible();
});

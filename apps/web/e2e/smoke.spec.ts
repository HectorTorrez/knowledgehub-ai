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
  await expect(page.getByText('Ready documents')).toBeVisible();
  await expect(page.getByText('Ready documents').locator('..')).toContainText('1');
  await expect(page.getByText('Your role').locator('..')).toContainText('Owner');
  await expect(page.getByText('Created', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Handbook' })).toBeVisible();

  await page.getByLabel('Search documents').fill('handbook');
  await expect(page.getByRole('link', { name: 'Handbook' })).toBeVisible();

  await page.getByLabel('Filter by status').click();
  await page.getByRole('option', { name: 'Failed' }).click();
  await expect(page.getByRole('heading', { name: 'No matching documents' })).toBeVisible();
});

test('opens the original file at the cited page', async ({ page }) => {
  await mockApi(page, { authenticated: true });

  await page.goto('/organizations/org-1/documents/doc-1?page=3');

  await expect(page.getByRole('heading', { name: 'Handbook' })).toBeVisible();
  await expect(page.getByText('Page 3', { exact: true })).toBeVisible();

  const open = page.getByRole('link', { name: 'Open page 3' });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute(
    'href',
    'https://fake-object-storage.test/handbook.pdf#page=3',
  );
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
  const source = page.getByRole('link', { name: 'Handbook' });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', /page=3/);
});

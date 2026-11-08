import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('imports a document from a URL', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await page
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await page.getByRole('button', { name: 'Import from URL' }).click();
  await page
    .getByLabel('URL', { exact: true })
    .fill('https://example.com/document.pdf');
  await page.getByLabel('Title (optional)').fill('Imported guide');
  await page.getByRole('button', { name: 'Import from URL' }).last().click();
  await expect(
    page.getByText('Document imported', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Imported guide', { exact: true })).toBeVisible();
});

test('shows a disallowed URL error', async ({ page }) => {
  await mockApi(page, { authenticated: true, urlImportError: true });
  await page.goto('/organizations/org-1/documents');
  await page
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await page.getByRole('button', { name: 'Import from URL' }).click();
  await page
    .getByLabel('URL', { exact: true })
    .fill('https://example.com/document.pdf');
  await page.getByRole('button', { name: 'Import from URL' }).last().click();
  await expect(page.getByRole('alert')).toHaveText('This URL is not allowed.');
});

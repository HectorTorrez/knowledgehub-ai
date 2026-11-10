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

test('checks a source and reports unchanged content', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  const date = '2026-11-10T00:00:00.000Z';
  const document = {
    id: 'doc-1',
    title: 'Imported guide',
    sourceUrl: 'https://example.com/guide.txt',
    sourceCheckedAt: null as string | null,
    generation: 1,
    collections: [],
    status: 'READY',
    processingStage: 'READY',
    retry: null,
    originalFileName: null,
    contentType: 'text/plain',
    sizeBytes: 100,
    failureReason: null,
    failureKind: null,
    createdAt: date,
    updatedAt: date,
  };
  await page.route(
    'http://localhost:3001/organizations/org-1/documents/doc-1',
    (route) => route.fulfill({ json: { document } }),
  );
  await page.route(
    'http://localhost:3001/organizations/org-1/documents/doc-1/refresh-url',
    (route) => {
      document.sourceCheckedAt = date;
      return route.fulfill({ json: { document, changed: false } });
    },
  );
  await page.goto('/organizations/org-1/documents/doc-1');
  await page.getByRole('button', { name: 'Check source for updates' }).click();
  await expect(page.getByText('The source has not changed.')).toBeVisible();
  await expect(page.getByText(/Last checked:/)).toBeVisible();
});

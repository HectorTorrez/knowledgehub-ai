import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('notifies about an uploaded document on another page and stops polling', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  let requests = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      request.url().endsWith('/organizations/org-1/documents/doc-2')
    )
      requests++;
  });
  await page.route('**/organizations/org-1/documents/doc-2', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        document: {
          id: 'doc-2',
          title: 'Policy',
          status: requests > 1 ? 'READY' : 'PROCESSING',
        },
      },
    });
  });
  await page.goto('/organizations/org-1/documents');
  await page.getByRole('button', { name: /Upload document/ }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'policy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 policy'),
  });
  await page.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(page.getByText('1 document uploaded')).toBeVisible();
  await page.goto('/organizations/org-1');
  await expect(page.getByText('Policy is ready')).toBeVisible({
    timeout: 15000,
  });
  const finishedRequests = requests;
  await page.waitForTimeout(6000);
  expect(requests).toBe(finishedRequests);
});

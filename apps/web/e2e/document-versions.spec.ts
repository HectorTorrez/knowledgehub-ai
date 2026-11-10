import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('opens an older cited file and warns about newer versions', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  const date = '2026-11-10T00:00:00.000Z';
  await page.route('**/organizations/org-1/documents/doc-1', (route) =>
    route.fulfill({
      json: {
        document: {
          id: 'doc-1',
          title: 'Handbook',
          generation: 2,
          collections: [],
          sourceUrl: null,
          status: 'READY',
          processingStage: 'READY',
          retry: null,
          originalFileName: 'updated.txt',
          contentType: 'text/plain',
          sizeBytes: 100,
          failureReason: null,
          failureKind: null,
          createdAt: date,
          updatedAt: date,
        },
      },
    }),
  );
  await page.route('**/organizations/org-1/documents/doc-1/versions', (route) =>
    route.fulfill({
      json: {
        versions: [2, 1].map((generation) => ({
          generation,
          originalFileName: generation === 1 ? 'original.txt' : 'updated.txt',
          contentType: 'text/plain',
          sizeBytes: 100,
          createdAt: date,
        })),
      },
    }),
  );
  await page.route(
    '**/organizations/org-1/documents/doc-1/download*',
    (route) => {
      const generation =
        new URL(route.request().url()).searchParams.get('generation') ?? '2';
      return route.fulfill({
        json: {
          url: `http://localhost:3001/version-${generation}.txt`,
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      });
    },
  );
  await page.route('**/version-*.txt', (route) =>
    route.fulfill({
      contentType: 'text/plain',
      body: route.request().url().includes('version-1')
        ? 'Original policy text'
        : 'Updated policy text',
    }),
  );
  await page.goto('/organizations/org-1/documents/doc-1?generation=1');
  await expect(
    page.getByText(
      'This answer cites version 1. A newer version is available.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Original policy text', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Version 2', exact: true }).click();
  await expect(
    page.getByText('Updated policy text', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'This answer cites version 1. A newer version is available.',
    ),
  ).toHaveCount(0);
});

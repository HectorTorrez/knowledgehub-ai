import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('landing shows the configured demo and opens its workspace', async ({
  page,
}) => {
  await mockApi(page, { authenticated: false, demo: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const demo = page.getByRole('button', { name: 'Try the live demo' });
  if (process.env.VITE_DEMO_ENABLED === 'true') {
    await demo.click();
    await expect(page).toHaveURL(/\/organizations\/org-1/);
  } else {
    await expect(demo).toHaveCount(0);
  }
});

test('signed-in visitors are redirected', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/');
  await expect(page).toHaveURL(/\/organizations\/?$/);
});

test('checklist shows progress and remembers dismissal', async ({ page }) => {
  await mockApi(page, { authenticated: true, empty: true });
  await page.goto('/organizations/org-1');
  await expect(page.getByText('Upload your first document')).toBeVisible();
  await expect(page.getByLabel('Not complete')).toHaveCount(4);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.reload();
  await expect(page.getByText('Upload your first document')).toHaveCount(0);
});

test('checklist hides when all milestones are complete', async ({ page }) => {
  await mockApi(page, { authenticated: true, complete: true });
  await page.goto('/organizations/org-1');
  await expect(page.getByText('Daily answer usage')).toBeVisible();
  await expect(page.getByText('Upload your first document')).toHaveCount(0);
});

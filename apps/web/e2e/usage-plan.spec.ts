import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('owners see organization usage', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/settings');
  await expect(page.getByText('Usage & plan', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Daily answers' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/#pricing');
});

test('viewers do not see organization usage', async ({ page }) => {
  await mockApi(page, { authenticated: true, role: 'VIEWER' });
  await page.goto('/organizations/org-1/settings');
  await expect(page.getByText('Usage & plan', { exact: true })).toHaveCount(0);
});

test('pricing is reachable from the landing navigation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The landing navigation is shown on desktop');
  await mockApi(page, { authenticated: false });
  await page.goto('/');
  await page.getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/#pricing$/);
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
});

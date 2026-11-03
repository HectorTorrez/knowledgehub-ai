import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

const pages = [
  ['landing', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['security', '/security'],
  ['overview', '/organizations/org-1'],
  ['documents', '/organizations/org-1/documents'],
  ['document detail', '/organizations/org-1/documents/doc-1'],
  ['organization settings', '/organizations/org-1/settings'],
  ['account settings', '/settings'],
] as const;

for (const [name, path] of pages) {
  test(`${name} meets WCAG 2.1 A and AA`, async ({ page }) => {
    await mockApi(page, { authenticated: !['/', '/login', '/register', '/security'].includes(path) });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('answer meets WCAG 2.1 A and AA', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask');
  await page.getByLabel('Your question').fill('How much leave do I get?');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByText('You get twenty days')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('search results meet WCAG 2.1 A and AA', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.route('http://localhost:3001/organizations/org-1/search*', async (route) => {
    await route.fulfill({ json: { results: [{ documentId: 'doc-1', documentTitle: 'Handbook', score: 0.9, matchCount: 1, matches: [{ excerpt: 'Paid leave', pageNumber: 1, chunkIndex: 0, highlights: [] }] }] } });
  });
  await page.goto('/organizations/org-1/search');
  await page.getByLabel('Search query').fill('leave');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Paid leave')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('skip link and popover support keyboard focus', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/search');
  await expect(page.getByLabel('Search query')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const trigger = page.getByLabel('Created after');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

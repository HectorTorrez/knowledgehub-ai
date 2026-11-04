import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test.describe('language switching', () => {
  test('switches to Español from the user menu and keeps it after reload', async ({
    page,
  }) => {
    await mockApi(page, { authenticated: true });
    await page.goto('/organizations/org-1/documents');

    if (test.info().project.name === 'mobile') {
      await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    }

    await page.getByRole('button', { name: /ada@example\.test/ }).click();
    await page.getByRole('menuitem', { name: 'Español' }).click();
    if (test.info().project.name === 'mobile') {
      await page.getByRole('link', { name: 'Documentos' }).click();
    }

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Documentos' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Subir documento' }),
    ).toBeVisible();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Documentos' }),
    ).toBeVisible();
  });
});

test.describe('Accept-Language detection', () => {
  test('shows the landing page in Spanish for a Spanish-preferring visitor', async ({
    page,
  }) => {
    await page.route('**/*', (route) =>
      route.continue({
        headers: { ...route.request().headers(), 'accept-language': 'es' },
      }),
    );
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Pregúntale lo que sea a tus documentos\./,
      }),
    ).toBeVisible();
  });
});

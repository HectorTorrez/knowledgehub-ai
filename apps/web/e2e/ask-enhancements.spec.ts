import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('suggests follow-ups under the latest answer and asks one', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');

  const followUps = page.getByRole('navigation', {
    name: 'Suggested follow-ups',
  });
  await expect(followUps).toBeVisible();
  await followUps
    .getByRole('button', { name: 'Ask “Does unused leave carry over?”' })
    .click();
  await expect(
    page.getByText('Does unused leave carry over?').first(),
  ).toBeVisible();
});

test('previews the cited passage when hovering a citation', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');

  await page.getByRole('link', { name: 'Go to source 1' }).first().hover();
  await expect(
    page
      .locator('[data-slot="hover-card-content"]')
      .getByText('Employees receive twenty days of leave each year.'),
  ).toBeVisible();
});

test('puts the last question back in the composer to edit it', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');

  await page.getByRole('button', { name: /^Edit the question/ }).click();
  await expect(page.getByLabel('Your question')).not.toHaveValue('');
  await expect(
    page.getByText('Editing your last question. Sending replaces its answer.'),
  ).toBeVisible();
  await page.getByLabel('Your question').press('Escape');
  await expect(
    page.getByText('Editing your last question. Sending replaces its answer.'),
  ).toBeHidden();
});

test('opens the keyboard shortcuts with the question mark key', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();

  await page.keyboard.press('?');
  await expect(
    page.getByRole('dialog', { name: 'Keyboard shortcuts' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Keyboard shortcuts' }),
  ).toBeHidden();

  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/organizations\/org-1\/search(\?|$)/);
});

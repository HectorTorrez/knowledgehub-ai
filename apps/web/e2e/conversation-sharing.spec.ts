import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('share a conversation and copy its link', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const patch = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' &&
      request.url().includes('/conversations/conversation-1'),
  );
  const popover = page.getByRole('dialog');
  const bounds = await popover.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320).toBe(true);
  await page.getByRole('switch', { name: 'Share with organization' }).click();
  expect((await patch).postDataJSON()).toEqual({ visibility: 'ORGANIZATION' });
  await expect(
    page.locator('button[aria-haspopup=dialog]').filter({ hasText: 'Shared' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'conversation=conversation-1',
  );
});

test('scopes and teammate read-only handoff', async ({ page, isMobile }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask');
  if (isMobile) {
    await page
      .getByRole('button', { name: 'Conversations', exact: true })
      .click();
  }
  const rail = isMobile
    ? page.getByRole('dialog', { name: 'Conversations' })
    : page.locator('aside');
  await expect(rail.getByTitle('Team conversation')).toBeVisible();
  await page.getByRole('button', { name: 'Mine', exact: true }).click();
  await expect(rail.getByTitle('Team conversation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Shared', exact: true }).click();
  await expect(rail.getByTitle('How much leave do I get?')).toHaveCount(0);
  await rail.getByTitle('Team conversation').click();
  await expect(page.getByLabel('Your question')).toBeDisabled();
  await expect(
    page.getByText('Only Grace can continue this conversation.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ask a follow-up in a new conversation' })
    .click();
  await expect(page.getByLabel('Your question')).toBeEnabled();
  await expect(page).not.toHaveURL(/conversation=/);
});

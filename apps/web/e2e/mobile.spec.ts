import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mock-api';

const VIEWPORT = { width: 320, height: 568 };

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;

    return [...document.querySelectorAll('main *')]
      .filter((element) => {
        if (element.closest('nav')) {
          return false;
        }

        const rect = element.getBoundingClientRect();

        return rect.width > 0 && rect.right > width + 1;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();

        return `${element.tagName}.${String(element.className).slice(0, 60)} right=${Math.round(rect.right)}`;
      });
  });
}

test('keeps organization pages within the mobile viewport', async ({ page }) => {
  await mockApi(page, { authenticated: true });

  for (const path of [
    '/organizations/org-1',
    '/organizations/org-1/documents',
    '/organizations/org-1/ask',
    '/organizations/org-1/search',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    expect(await overflowingElements(page), path).toEqual([]);
    expect(await page.locator('h1').count(), path).toBe(1);
  }
});

test('exposes every organization section in the bottom navigation', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await page.waitForLoadState('networkidle');

  const nav = page.getByRole('navigation', { name: 'Organization sections' });

  await expect(nav.getByRole('link')).toHaveCount(5);

  for (const label of ['Overview', 'Documents', 'Ask', 'Search', 'Settings']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }

  await expect(nav.getByRole('link', { name: 'Documents' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const brand = page.getByRole('link', { name: 'KnowledgeHub' });
  const brandBox = await brand.boundingBox();

  expect(brandBox).not.toBeNull();
  expect(brandBox!.height).toBeLessThanOrEqual(32);
});

test('keeps key touch targets at least 44px tall', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');
  await page.waitForLoadState('networkidle');

  const newConversation = page.getByRole('button', {
    name: 'New conversation',
  });
  const newConversationBox = await newConversation.boundingBox();
  expect(newConversationBox).not.toBeNull();
  expect(newConversationBox!.height).toBeGreaterThanOrEqual(44);

  const nav = page.getByRole('navigation', { name: 'Organization sections' });
  const navLinkBox = await nav
    .getByRole('link', { name: 'Ask' })
    .boundingBox();
  expect(navLinkBox).not.toBeNull();
  expect(navLinkBox!.height).toBeGreaterThanOrEqual(44);

  await page.goto('/organizations/org-1/documents');
  await page.waitForLoadState('networkidle');

  const actions = page.getByRole('button', { name: 'Actions for Handbook' });
  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.height).toBeGreaterThanOrEqual(44);
});

test('keeps the ask composer and answer inside the mobile viewport', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/ask?conversation=conversation-1');
  await page.waitForLoadState('networkidle');

  const composer = page
    .getByLabel('Your question')
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const composerBox = await composer.boundingBox();

  expect(composerBox).not.toBeNull();
  expect(composerBox!.x).toBeGreaterThanOrEqual(0);
  expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(
    VIEWPORT.width,
  );
  expect(composerBox!.y).toBeLessThan(VIEWPORT.height - 56);

  await expect(page.locator('#conversation-list')).toBeHidden();
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.locator('#conversation-list')).toBeVisible();

  const answer = page.locator('article [data-slot="card"]').first();
  const answerBox = await answer.boundingBox();

  expect(answerBox).not.toBeNull();
  expect(answerBox!.x + answerBox!.width).toBeLessThanOrEqual(VIEWPORT.width);
});

test('gives document and member names room on small screens', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });

  await page.goto('/organizations/org-1/documents');
  await page.waitForLoadState('networkidle');

  const documentLink = page.getByRole('link', { name: /Handbook/ });
  const documentBox = await documentLink.boundingBox();

  expect(documentBox).not.toBeNull();
  expect(documentBox!.width).toBeGreaterThan(160);

  await page.goto('/organizations/org-1');
  await page.waitForLoadState('networkidle');

  const memberName = page.locator('main li p').first();
  const memberBox = await memberName.boundingBox();

  expect(memberBox).not.toBeNull();
  expect(memberBox!.width).toBeGreaterThan(150);
});

test('opens the document detail page from the documents list', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents/doc-1');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'Handbook' })).toBeVisible();
  await expect(page.getByText('Original file')).toBeVisible();
  expect(await overflowingElements(page)).toEqual([]);
});

test('fits a queued upload dialog inside the mobile viewport', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto('/organizations/org-1/documents');
  await page.getByRole('button', { name: /Upload document/ }).click();
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'employee-handbook-2026-final.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    },
    {
      name: 'parental-leave-policy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    },
    {
      name: 'security-runbook.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# runbook'),
    },
  ]);

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog.getByText('3 files ready')).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height);

  const scrollable = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);

    return (
      style.overflowY === 'auto' && element.scrollHeight >= element.clientHeight
    );
  });
  expect(scrollable).toBe(true);
});

import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api';

test('conversation rows fit their title and date at desktop width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, { authenticated: true });
  const title =
    'A very long conversation title that should be truncated with an ellipsis within the conversation rail';
  await page.route(
    'http://localhost:3001/organizations/org-1/conversations**',
    async (route) => {
      await route.fulfill({
        json: {
          conversations: [
            {
              id: 'conversation-1',
              title,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        },
      });
    },
  );
  await page.goto('/organizations/org-1/ask');
  const titleElement = page.getByTitle(title);
  await expect(titleElement).toBeVisible();
  const geometry = await titleElement.evaluate((element) => {
    const date = element.nextElementSibling!;
    const row = element.closest('li')!;
    return {
      titleBottom: element.getBoundingClientRect().bottom,
      dateTop: date.getBoundingClientRect().top,
      titleRight: element.getBoundingClientRect().right,
      rowRight: row.getBoundingClientRect().right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      textOverflow: getComputedStyle(element).textOverflow,
    };
  });
  expect(geometry.dateTop).toBeGreaterThanOrEqual(geometry.titleBottom);
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.titleRight).toBeLessThanOrEqual(geometry.rowRight);
  expect(geometry.textOverflow).toBe('ellipsis');
});

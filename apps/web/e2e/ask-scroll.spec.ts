import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mock-api';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const ANSWER_COUNT = 8;
const CITATION = {
  marker: 1,
  documentId: 'doc-1',
  documentTitle: 'Handbook',
  pageNumber: 3,
  chunkIndex: 0,
  excerpt: 'Employees receive twenty days of leave each year.',
};
const LONG_ANSWER = Array.from(
  { length: 6 },
  (_unused, index) =>
    `Paragraph ${index + 1}: employees receive twenty days of leave each year, plus public holidays. [1]`,
).join('\n\n');

function summary(index: number) {
  return {
    id: `answer-${index}`,
    question: `How much leave do I get in year ${index}?`,
    status: 'answered',
    conversationId: 'conversation-1',
    createdAt: CREATED_AT,
  };
}

async function mockLongConversation(page: Page): Promise<void> {
  await page.route(
    'http://localhost:3001/organizations/org-1/answers**',
    async (route) => {
      const url = new URL(route.request().url());
      const match = /\/answers\/(answer-\d+)$/.exec(url.pathname);

      if (match !== null) {
        const index = Number(match[1]!.replace('answer-', ''));

        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            answer: {
              ...summary(index),
              answer: LONG_ANSWER,
              citations: [CITATION],
              feedback: null,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answers: Array.from({ length: ANSWER_COUNT }, (_unused, index) =>
            summary(index),
          ),
          nextCursor: null,
        }),
      });
    },
  );
}

async function transcriptScroll(page: Page) {
  return page.evaluate(() => {
    const article = document.querySelector('ol li article');
    let element = article?.parentElement?.parentElement ?? null;

    while (element !== null && element.scrollHeight <= element.clientHeight) {
      element = element.parentElement;
    }

    if (element === null) {
      return null;
    }

    return {
      scrollTop: Math.round(element.scrollTop),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      distanceFromBottom: Math.round(
        element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    };
  });
}

test('opens a conversation scrolled to the latest answer', async ({ page }) => {
  await mockApi(page, { authenticated: true });
  await mockLongConversation(page);

  await page.goto('/organizations/org-1/ask?conversation=conversation-1');

  await expect(page.getByText('Paragraph 6').last()).toBeVisible();
  await expect(page.locator('ol li')).toHaveCount(ANSWER_COUNT);
  await page.waitForTimeout(1500);

  const state = await transcriptScroll(page);

  expect(state, 'scroll container').not.toBeNull();
  expect(state!.distanceFromBottom).toBeLessThan(32);
});

test('resumes following the transcript from the jump button', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await mockLongConversation(page);

  await page.goto('/organizations/org-1/ask?conversation=conversation-1');
  await expect(page.locator('ol li')).toHaveCount(ANSWER_COUNT);
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const article = document.querySelector('ol li article');
    let element = article?.parentElement?.parentElement ?? null;

    while (element !== null && element.scrollHeight <= element.clientHeight) {
      element = element.parentElement;
    }

    element?.scrollTo({ top: 0 });
  });

  const jump = page.getByRole('button', { name: 'Jump to latest' });

  await expect(jump).toBeVisible();
  await jump.click();

  await expect
    .poll(async () => (await transcriptScroll(page))?.distanceFromBottom)
    .toBeLessThan(32);
  await expect(jump).toBeHidden();
});

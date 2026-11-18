import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mock-api';

const ASK_URL = '/organizations/org-1/ask';

async function mockDictation(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      lang = '';
      onresult?: (event: { resultIndex: number; results: unknown[] }) => void;
      onerror?: (event: { error: string }) => void;
      onend?: () => void;

      start() {
        document.documentElement.dataset.testDictationLanguage = this.lang;
        window.addEventListener('dictation-result', this.result);
        window.addEventListener('dictation-end', this.end, { once: true });
        window.addEventListener('dictation-denied', this.deny, { once: true });
      }

      stop() {
        document.documentElement.dataset.testDictationStopped = 'true';
      }

      abort() {
        document.documentElement.dataset.testDictationAborted = 'true';
        this.end();
      }

      private result = (event: Event) => {
        const { resultIndex, transcripts } = (event as CustomEvent).detail;
        const results = transcripts.map((transcript: string) =>
          Object.assign([{ transcript }], { isFinal: true }),
        );
        this.onresult?.({ resultIndex, results });
      };

      private deny = () => {
        this.onerror?.({ error: 'not-allowed' });
        this.end();
      };

      private end = () => {
        window.removeEventListener('dictation-result', this.result);
        window.removeEventListener('dictation-end', this.end);
        window.removeEventListener('dictation-denied', this.deny);
        this.onend?.();
      };
    }

    Object.defineProperties(window, {
      SpeechRecognition: { value: undefined },
      webkitSpeechRecognition: { value: Recognition },
    });
  });
}

test('adds finalized dictation to an editable draft without sending it', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await mockDictation(page);
  await page.goto(ASK_URL);

  const question = page.getByLabel('Your question');
  const send = page.getByRole('button', { name: 'Ask', exact: true });
  await question.fill('Please');
  await page.getByRole('button', { name: 'Dictate question' }).click();
  await expect(page.getByText('Listening…')).toBeVisible();
  await expect(send).toBeDisabled();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('dictation-result', {
        detail: { resultIndex: 0, transcripts: ['summarize'] },
      }),
    );
  });
  await expect(question).toHaveValue('Please summarize');
  await question.fill('Could you summarize');
  await question.press('Enter');

  await page.getByRole('button', { name: 'Stop dictation' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-test-dictation-stopped',
    'true',
  );
  await expect(page.getByText('Finishing transcription…')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('dictation-result', {
        detail: { resultIndex: 1, transcripts: ['summarize', 'the handbook?'] },
      }),
    );
    window.dispatchEvent(new Event('dictation-end'));
  });

  await expect(question).toHaveValue('Could you summarize the handbook?');
  await expect(send).toBeEnabled();
  await page.reload();
  await expect(question).toHaveValue('Could you summarize the handbook?');
});

test('releases the microphone when switching conversations', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await mockDictation(page);
  await page.goto(ASK_URL);

  await page.getByRole('button', { name: 'Dictate question' }).click();
  await page
    .getByRole('button', { name: /^How much leave do I get\?/ })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-test-dictation-aborted',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Dictate question' }),
  ).toBeEnabled();
});

test('uses the app language and recovers from denied microphone access', async ({
  context,
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await context.addCookies([
    { name: 'locale', value: 'es', domain: 'localhost', path: '/' },
  ]);
  await mockDictation(page);
  await page.goto(ASK_URL);

  const dictate = page.getByRole('button', { name: 'Dictar pregunta' });
  await dictate.click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-test-dictation-language',
    'es',
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('dictation-denied'));
  });
  await expect(page.getByText(/Permite el acceso al micrófono/)).toBeVisible();
  await expect(dictate).toBeEnabled();
});

test('keeps typing available when the browser lacks dictation', async ({
  page,
}) => {
  await mockApi(page, { authenticated: true });
  await page.addInitScript(() => {
    Object.defineProperties(window, {
      SpeechRecognition: { value: undefined },
      webkitSpeechRecognition: { value: undefined },
    });
  });
  await page.goto(ASK_URL);

  await page.getByRole('button', { name: 'Dictate question' }).click();
  await expect(
    page.getByText('This browser does not support dictation.'),
  ).toBeVisible();
  await page.getByLabel('Your question').fill('Summarize the handbook.');
  await expect(
    page.getByRole('button', { name: 'Ask', exact: true }),
  ).toBeEnabled();
});

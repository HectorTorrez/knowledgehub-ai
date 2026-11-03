import type { Page, Route } from '@playwright/test';
import { createMinimalPdf } from './minimal-pdf';

const API_ORIGIN = 'http://localhost:3001';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

export const USER = {
  id: 'user-1',
  email: 'ada@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const ORGANIZATION = {
  id: 'org-1',
  name: 'Acme',
  role: 'OWNER',
  capabilities: [
    'documents.view',
    'documents.write',
    'documents.delete',
    'answers.ask',
    'search',
    'conversations.viewOwn',
    'members.manage',
    'owners.manage',
    'organization.manage',
    'organization.delete',
    'insights.view',
  ],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const DOCUMENT = {
  id: 'doc-1',
  title: 'Handbook',
  status: 'READY',
  processingStage: 'READY',
  retry: null,
  originalFileName: 'handbook.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  failureReason: null,
  failureKind: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const ANSWER = {
  id: 'answer-1',
  question: 'How much leave do I get?',
  status: 'answered',
  conversationId: 'conversation-1',
  createdAt: CREATED_AT,
};

interface ApiOptions {
  authenticated: boolean;
  role?: 'OWNER' | 'VIEWER';
  demo?: boolean;
  empty?: boolean;
  complete?: boolean;
  progress?: 'ready-after-poll' | 'failed';
  onAsk?: () => void;
}

function json(
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

export async function mockApi(page: Page, options: ApiOptions): Promise<void> {
  let authenticated = options.authenticated;
  let documentRequests = 0;
  function currentDocument() {
    if (options.progress === 'failed') {
      return {
        ...DOCUMENT,
        status: 'FAILED',
        processingStage: 'FAILED',
        failureKind: 'VERIFICATION',
        failureReason: 'INVALID_FILE',
      };
    }
    if (options.progress === 'ready-after-poll' && documentRequests++ === 0) {
      return {
        ...DOCUMENT,
        status: 'PROCESSING',
        processingStage: 'PROCESSING',
      };
    }
    return DOCUMENT;
  }
  const organization =
    options.role === 'VIEWER'
      ? {
          ...ORGANIZATION,
          role: 'VIEWER',
          capabilities: [
            'documents.view',
            'answers.ask',
            'search',
            'conversations.viewOwn',
          ],
        }
      : ORGANIZATION;
  await page.route('https://fake-object-storage.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: Buffer.from(
        createMinimalPdf('Employees receive twenty days of leave each year.'),
      ),
    });
  });

  await page.route(`${API_ORIGIN}/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/auth/session') {
      if (!authenticated) {
        await route.fulfill(
          json({ statusCode: 401, message: 'Not signed in' }, 401),
        );
        return;
      }

      await route.fulfill(json({ user: USER }));
      return;
    }

    if (path === '/auth/refresh') {
      await route.fulfill(
        json({ statusCode: 401, message: 'Not signed in' }, 401),
      );
      return;
    }

    if (path === '/auth/login' && method === 'POST') {
      authenticated = true;
      await route.fulfill(json({ user: USER }));
      return;
    }

    if (path === '/auth/logout') {
      authenticated = false;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (path === '/organizations') {
      const primary = options.demo ? { ...organization, name: 'Northwind Labs' } : organization;
      await route.fulfill(json({ organizations: [primary, { ...organization, id: 'org-2', name: 'Beta' }] }));
      return;
    }

    if (path === '/organizations/org-2') {
      await route.fulfill(json({ organization: { ...organization, id: 'org-2', name: 'Beta' } }));
      return;
    }

    if (path === '/organizations/org-1') {
      await route.fulfill(json({ organization }));
      return;
    }

    if (path === '/organizations/org-1/activity' && method === 'GET') {
      await route.fulfill(
        json({
          activities: [
            {
              id: 'activity-1',
              action: 'DOCUMENT_UPLOADED',
              actor: USER,
              targetType: 'document',
              targetId: 'doc-1',
              metadata: { title: 'Handbook' },
              createdAt: CREATED_AT,
            },
          ],
          nextCursor: null,
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/members') {
      await route.fulfill(
        json({
          members: [
            ...(options.complete ? [{ userId: 'user-2', email: 'other@example.test', firstName: 'Other', lastName: 'User', role: 'MEMBER', createdAt: CREATED_AT }] : []),
            {
              userId: USER.id,
              email: USER.email,
              firstName: USER.firstName,
              lastName: USER.lastName,
              role: 'OWNER',
              createdAt: CREATED_AT,
            },
          ],
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/invitations') {
      await route.fulfill(json({ invitations: [] }));
      return;
    }

    if (path === '/organizations/org-1/usage') {
      await route.fulfill(
        json({
          usage: {
            answers: {
              used: 2,
              limit: 100,
              periodStart: CREATED_AT,
              resetsAt: '2026-01-02T00:00:00.000Z',
            },
          },
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/documents') {
      const failedOnly = url.searchParams.get('status') === 'FAILED';
      await route.fulfill(
        json({
          documents: failedOnly || options.empty ? [] : [DOCUMENT],
          nextCursor: null,
        }),
      );
      return;
    }

    if (path === `/organizations/org-1/documents/${DOCUMENT.id}/download`) {
      await route.fulfill(
        json({
          url: `https://fake-object-storage.test/${DOCUMENT.originalFileName}`,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      );
      return;
    }

    if (path === `/organizations/org-1/documents/${DOCUMENT.id}`) {
      await route.fulfill(json({ document: currentDocument() }));
      return;
    }

    if (path === '/organizations/org-1/conversations/conversation-1') {
      await route.fulfill(
        json({
          conversation: {
            id: 'conversation-1',
            title: 'How much leave do I get?',
            createdAt: CREATED_AT,
          },
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/conversations' && method === 'GET') {
      await route.fulfill(
        json({
          conversations: options.empty ? [] : [
            { id: 'conversation-1', title: 'How much leave do I get?', createdAt: CREATED_AT },
          ],
          nextCursor: null,
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/conversations' && method === 'POST') {
      await route.fulfill(
        json(
          {
            conversation: {
              id: 'conversation-1',
              title: null,
              createdAt: CREATED_AT,
            },
          },
          201,
        ),
      );
      return;
    }

    if (path === '/organizations/org-1/answers' && method === 'POST') {
      options.onAsk?.();
      const events = [
        { type: 'status', status: 'answered' },
        { type: 'delta', text: 'You get twenty days [1].' },
        {
          type: 'citations',
          citations: [
            {
              marker: 1,
              documentId: DOCUMENT.id,
              documentTitle: DOCUMENT.title,
              pageNumber: 3,
              chunkIndex: 0,
              excerpt: 'Employees receive twenty days of leave each year.',
            },
          ],
        },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      });
      return;
    }

    if (path === '/organizations/org-1/answers' && method === 'GET') {
      await route.fulfill(json({ answers: [ANSWER], nextCursor: null }));
      return;
    }

    if (path === '/organizations/org-1/answers/answer-1') {
      await route.fulfill(
        json({
          answer: {
            ...ANSWER,
            answer: 'You get twenty days [1].',
            citations: [
              {
                marker: 1,
                documentId: DOCUMENT.id,
                documentTitle: DOCUMENT.title,
                pageNumber: 3,
                chunkIndex: 0,
                excerpt: 'Employees receive twenty days of leave each year.',
              },
            ],
            feedback: null,
          },
        }),
      );
      return;
    }

    await route.fulfill(
      json({ statusCode: 404, message: `Unhandled ${path}` }, 404),
    );
  });
}

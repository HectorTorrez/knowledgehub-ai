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
  collections: [],
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
  deletionBlocked?: boolean;
  auditPages?: boolean;
  role?: 'OWNER' | 'VIEWER';
  demo?: boolean;
  empty?: boolean;
  emptyResources?: Array<'documents' | 'conversations' | 'activity' | 'search'>;
  failingResources?: string[];
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
  await page
    .context()
    .addCookies([
      { name: 'locale', value: 'en', domain: 'localhost', path: '/' },
    ]);
  let authenticated = options.authenticated;
  let documentRequests = 0;
  let collections: Array<{
    id: string;
    name: string;
    color: string;
    documentCount: number;
  }> = [];
  let assigned: string[] = [];
  const conversations = [
    {
      id: 'conversation-1',
      title: 'How much leave do I get?',
      createdAt: CREATED_AT,
      visibility: 'PRIVATE',
      createdBy: USER,
      canEdit: true,
      canShare: true,
    },
    {
      id: 'conversation-2',
      title: 'Team conversation',
      createdAt: CREATED_AT,
      visibility: 'ORGANIZATION',
      createdBy: { id: 'user-2', firstName: 'Grace', lastName: 'Hopper' },
      canEdit: false,
      canShare: false,
    },
  ];
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
    return {
      ...DOCUMENT,
      collections: collections.filter((item) => assigned.includes(item.id)),
    };
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
    const resource = path.split('/').at(-1);
    if (
      method === 'GET' &&
      options.failingResources?.some((item) => item === resource)
    ) {
      await route.fulfill(json({ message: 'Service unavailable' }, 503));
      return;
    }
    if (
      method === 'GET' &&
      resource === 'search' &&
      options.emptyResources?.includes('search')
    ) {
      await route.fulfill(json({ results: [] }));
      return;
    }
    if (
      method === 'GET' &&
      resource === 'activity' &&
      options.emptyResources?.includes('activity')
    ) {
      await route.fulfill(json({ activities: [], nextCursor: null }));
      return;
    }

    if (path === '/auth/me/export') {
      await route.fulfill(
        json({
          profile: USER,
          memberships: [],
          conversations: [],
          answers: [],
          feedback: [],
        }),
      );
      return;
    }
    if (path === '/auth/me' && method === 'DELETE') {
      if (options.deletionBlocked) {
        await route.fulfill(
          json({ organizations: [{ id: 'org-1', name: 'Acme' }] }, 409),
        );
      } else {
        authenticated = false;
        await route.fulfill({ status: 204, body: '' });
      }
      return;
    }
    if (path === '/auth/sessions') {
      await route.fulfill(json({ sessions: [] }));
      return;
    }

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
      const primary = options.demo
        ? { ...organization, name: 'Northwind Labs' }
        : organization;
      await route.fulfill(
        json({
          organizations: [
            primary,
            { ...organization, id: 'org-2', name: 'Beta' },
          ],
        }),
      );
      return;
    }

    if (path === '/organizations/org-2') {
      await route.fulfill(
        json({ organization: { ...organization, id: 'org-2', name: 'Beta' } }),
      );
      return;
    }

    if (path === '/organizations/org-1') {
      await route.fulfill(json({ organization }));
      return;
    }

    if (path === '/organizations/org-1/activity' && method === 'GET') {
      const auditItem = {
        id: 'activity-1',
        action: 'DOCUMENT_UPLOADED',
        actor: USER,
        targetType: 'document',
        targetId: 'doc-1',
        metadata: { title: 'Handbook' },
        createdAt: CREATED_AT,
      };
      if (options.auditPages) {
        const matches =
          (!url.searchParams.get('action') ||
            url.searchParams.get('action') === auditItem.action) &&
          (!url.searchParams.get('actorId') ||
            url.searchParams.get('actorId') === USER.id);
        await route.fulfill(
          json({
            activities: matches
              ? [
                  {
                    ...auditItem,
                    id: url.searchParams.has('cursor')
                      ? 'activity-2'
                      : 'activity-1',
                  },
                ]
              : [],
            nextCursor:
              matches && !url.searchParams.has('cursor') ? 'next' : null,
          }),
        );
        return;
      }
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
            ...(options.complete
              ? [
                  {
                    userId: 'user-2',
                    email: 'other@example.test',
                    firstName: 'Other',
                    lastName: 'User',
                    role: 'MEMBER',
                    createdAt: CREATED_AT,
                  },
                ]
              : []),
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
            documents: { used: 1, limit: null },
            storageBytes: { used: 1024, limit: null },
            members: { used: 1, limit: null },
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

    if (path === '/organizations/org-1/collections') {
      if (method === 'POST') {
        const item = {
          ...request.postDataJSON(),
          id: 'collection-1',
          documentCount: 0,
        };
        collections.push(item);
        await route.fulfill(json(item, 201));
      } else {
        await route.fulfill(json(collections));
      }
      return;
    }
    const collectionMatch =
      /^\/organizations\/org-1\/collections\/([^/]+)$/.exec(path);
    if (collectionMatch) {
      if (method === 'DELETE') {
        collections = collections.filter(
          (item) => item.id !== collectionMatch[1],
        );
        assigned = assigned.filter((id) => id !== collectionMatch[1]);
        await route.fulfill({ status: 204 });
      } else {
        const item = collections.find(
          (entry) => entry.id === collectionMatch[1],
        );
        Object.assign(item!, request.postDataJSON());
        await route.fulfill(json(item));
      }
      return;
    }
    if (
      path === `/organizations/org-1/documents/${DOCUMENT.id}/collections` &&
      method === 'PUT'
    ) {
      assigned = request.postDataJSON().collectionIds;
      await route.fulfill({ status: 204 });
      return;
    }

    if (path === '/organizations/org-1/documents') {
      const failedOnly = url.searchParams.get('status') === 'FAILED';
      await route.fulfill(
        json({
          documents:
            failedOnly ||
            options.empty ||
            options.emptyResources?.includes('documents') ||
            (url.searchParams.has('collectionId') &&
              !assigned.includes(url.searchParams.get('collectionId')!))
              ? []
              : [currentDocument()],
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

    const conversationMatch =
      /^\/organizations\/org-1\/conversations\/([^/]+)$/.exec(path);
    if (conversationMatch) {
      const conversation = conversations.find(
        (item) => item.id === conversationMatch[1],
      );
      if (!conversation) {
        await route.fulfill(json({ message: 'Not found' }, 404));
        return;
      }
      if (method === 'PATCH') {
        conversation.visibility = request.postDataJSON().visibility;
      }
      await route.fulfill(json({ conversation }));
      return;
    }

    if (path === '/organizations/org-1/conversations' && method === 'GET') {
      const scope = url.searchParams.get('scope');
      const filtered = conversations.filter((item) =>
        scope === 'mine'
          ? item.createdBy.id === USER.id
          : scope === 'shared'
            ? item.visibility === 'ORGANIZATION'
            : true,
      );
      await route.fulfill(
        json({
          conversations:
            options.empty || options.emptyResources?.includes('conversations')
              ? []
              : filtered,
          nextCursor: null,
        }),
      );
      return;
    }

    if (path === '/organizations/org-1/conversations' && method === 'POST') {
      await route.fulfill(json({ conversation: conversations[0] }, 201));
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

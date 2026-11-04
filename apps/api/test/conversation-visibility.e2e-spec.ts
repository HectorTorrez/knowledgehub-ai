import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ANSWER_PROVIDER } from '../src/answers/answer-provider.port.js';
import { QUERY_REWRITER } from '../src/answers/query-rewriter.port.js';
import { RERANKER } from '../src/answers/reranker.port.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/cookies.js';
import { EMBEDDING_PROVIDER } from '../src/embeddings/embedding-provider.port.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SUMMARIZER } from '../src/summaries/summarizer.js';
import { FakeAnswerProvider } from './support/fake-answer-provider.js';

const PASSWORD = 'correct horse battery staple';

interface Member {
  userId: string;
  token: string;
}

function cookieValue(response: request.Response, name: string): string {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected cookie "${name}" to be set`);
  }
  return cookie.slice(name.length + 1).split(';')[0];
}

function bearer(member: Member): { Authorization: string } {
  return { Authorization: `Bearer ${member.token}` };
}

describe('conversation visibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const trackedEmails = new Set<string>();
  const trackedOrganizationIds = new Set<string>();
  const answerProvider = new FakeAnswerProvider();

  const http = () => request(app.getHttpServer());

  const registerUser = async (): Promise<Member> => {
    const email = `visibility-${randomUUID()}@example.test`;
    trackedEmails.add(email);
    const response = await http()
      .post('/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
      .expect(201);
    return {
      userId: response.body.user.id as string,
      token: cookieValue(response, ACCESS_TOKEN_COOKIE),
    };
  };

  const createOrganization = async (owner: Member): Promise<string> => {
    const response = await http()
      .post('/organizations')
      .set(bearer(owner))
      .send({ name: `Visibility ${randomUUID()}` })
      .expect(201);
    const organizationId = response.body.organization.id as string;
    trackedOrganizationIds.add(organizationId);
    return organizationId;
  };

  const addMember = async (
    organizationId: string,
    role: MembershipRole,
  ): Promise<Member> => {
    const member = await registerUser();
    await prisma.membership.create({
      data: { organizationId, userId: member.userId, role },
    });
    return member;
  };

  const startConversation = async (
    organizationId: string,
    member: Member,
  ): Promise<string> => {
    const response = await http()
      .post(`/organizations/${organizationId}/conversations`)
      .set(bearer(member))
      .expect(201);
    return response.body.conversation.id as string;
  };

  const seedAnswer = async (
    organizationId: string,
    conversationId: string,
    askedById: string | null,
  ): Promise<string> => {
    const answer = await prisma.answer.create({
      data: {
        organizationId,
        conversationId,
        askedById,
        question: 'How much leave do I get?',
        status: 'answered',
        answer: 'Twenty days.',
        citations: [],
      },
    });
    return answer.id;
  };

  const share = (
    organizationId: string,
    conversationId: string,
    member: Member,
    visibility: 'PRIVATE' | 'ORGANIZATION',
  ) =>
    http()
      .patch(`/organizations/${organizationId}/conversations/${conversationId}`)
      .set(bearer(member))
      .send({ visibility });

  const expectReadable = async (
    organizationId: string,
    conversationId: string,
    answerId: string,
    member: Member,
    status: 200 | 404,
  ) => {
    const base = `/organizations/${organizationId}`;
    await http()
      .get(`${base}/conversations/${conversationId}`)
      .set(bearer(member))
      .expect(status);
    await http()
      .get(`${base}/conversations/${conversationId}/export`)
      .set(bearer(member))
      .expect(status);
    await http()
      .get(`${base}/answers/${answerId}`)
      .set(bearer(member))
      .expect(status);
    await http()
      .put(`${base}/answers/${answerId}/feedback`)
      .set(bearer(member))
      .send({ value: 'UP' })
      .expect(status);
    const listed = await http()
      .get(`${base}/answers`)
      .query({ conversationId, askedBy: 'organization' })
      .set(bearer(member))
      .expect(200);
    expect(listed.body.answers.length > 0).toBe(status === 200);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARIZER)
      .useValue({
        summarize: async () => ({ summary: 'test summary', keyTopics: [] }),
      })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue({
        embed: async (texts: string[]) =>
          texts.map(() =>
            Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, index) =>
              index === 0 ? 1 : 0,
            ),
          ),
      })
      .overrideProvider(RERANKER)
      .useValue({ rerank: async () => [] })
      .overrideProvider(QUERY_REWRITER)
      .useValue({ rewrite: async (question: string) => question })
      .overrideProvider(ANSWER_PROVIDER)
      .useValue(answerProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    if (trackedOrganizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...trackedOrganizationIds] } },
      });
      trackedOrganizationIds.clear();
    }
  });

  afterAll(async () => {
    if (trackedEmails.size > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: [...trackedEmails] } },
      });
    }
    await app.close();
  });

  it('keeps a new conversation private to its creator', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const teammate = await addMember(organizationId, 'MEMBER');
    const conversationId = await startConversation(organizationId, owner);
    const answerId = await seedAnswer(
      organizationId,
      conversationId,
      owner.userId,
    );

    const created = await http()
      .get(`/organizations/${organizationId}/conversations/${conversationId}`)
      .set(bearer(owner))
      .expect(200);
    expect(created.body.conversation).toMatchObject({
      visibility: 'PRIVATE',
      createdBy: { id: owner.userId, firstName: 'Ada', lastName: 'Lovelace' },
      canEdit: true,
      canShare: true,
    });

    await expectReadable(
      organizationId,
      conversationId,
      answerId,
      teammate,
      404,
    );

    const listed = await http()
      .get(`/organizations/${organizationId}/conversations`)
      .set(bearer(teammate))
      .expect(200);
    expect(listed.body.conversations).toEqual([]);

    await http()
      .post(`/organizations/${organizationId}/answers`)
      .set(bearer(teammate))
      .send({ question: 'And sick leave?', conversationId })
      .expect(404);
  });

  it('opens a shared conversation read-only to teammates until it is unshared', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const teammate = await addMember(organizationId, 'ADMIN');
    const conversationId = await startConversation(organizationId, owner);
    const answerId = await seedAnswer(
      organizationId,
      conversationId,
      owner.userId,
    );

    const shared = await share(
      organizationId,
      conversationId,
      owner,
      'ORGANIZATION',
    ).expect(200);
    expect(shared.body.conversation.visibility).toBe('ORGANIZATION');

    await expectReadable(
      organizationId,
      conversationId,
      answerId,
      teammate,
      200,
    );

    const detail = await http()
      .get(`/organizations/${organizationId}/conversations/${conversationId}`)
      .set(bearer(teammate))
      .expect(200);
    expect(detail.body.conversation).toMatchObject({
      canEdit: false,
      canShare: false,
    });

    await share(organizationId, conversationId, teammate, 'PRIVATE').expect(
      404,
    );
    await http()
      .delete(
        `/organizations/${organizationId}/conversations/${conversationId}`,
      )
      .set(bearer(teammate))
      .expect(404);
    await http()
      .post(`/organizations/${organizationId}/answers`)
      .set(bearer(teammate))
      .send({ question: 'And sick leave?', conversationId })
      .expect(404);

    const activity = await prisma.organizationActivity.findMany({
      where: { organizationId, action: 'CONVERSATION_SHARED' },
    });
    expect(activity).toHaveLength(1);

    await share(organizationId, conversationId, owner, 'PRIVATE').expect(200);
    await http()
      .get(`/organizations/${organizationId}/conversations/${conversationId}`)
      .set(bearer(teammate))
      .expect(404);
  });

  it('never leaks private conversations on later list pages', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const teammate = await addMember(organizationId, 'MEMBER');

    for (let index = 0; index < 3; index += 1) {
      await startConversation(organizationId, owner);
    }
    const sharedIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const id = await startConversation(organizationId, owner);
      await share(organizationId, id, owner, 'ORGANIZATION').expect(200);
      sharedIds.push(id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await http()
        .get(`/organizations/${organizationId}/conversations`)
        .query({ limit: 1, ...(cursor ? { cursor } : {}) })
        .set(bearer(teammate))
        .expect(200);
      seen.push(
        ...page.body.conversations.map((item: { id: string }) => item.id),
      );
      cursor = page.body.nextCursor as string | null;
    } while (cursor);

    expect(seen.sort()).toEqual([...sharedIds].sort());
  });

  it('separates mine and shared scopes', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const teammate = await addMember(organizationId, 'MEMBER');
    const own = await startConversation(organizationId, teammate);
    const theirs = await startConversation(organizationId, owner);
    await share(organizationId, theirs, owner, 'ORGANIZATION').expect(200);

    const mine = await http()
      .get(`/organizations/${organizationId}/conversations`)
      .query({ scope: 'mine' })
      .set(bearer(teammate))
      .expect(200);
    expect(
      mine.body.conversations.map((item: { id: string }) => item.id),
    ).toEqual([own]);

    const shared = await http()
      .get(`/organizations/${organizationId}/conversations`)
      .query({ scope: 'shared' })
      .set(bearer(teammate))
      .expect(200);
    expect(
      shared.body.conversations.map((item: { id: string }) => item.id),
    ).toEqual([theirs]);
  });

  it('keeps legacy conversations open to every member and manageable by admins', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const member = await addMember(organizationId, 'MEMBER');
    const admin = await addMember(organizationId, 'ADMIN');
    const legacy = await prisma.conversation.create({
      data: { organizationId, title: 'Legacy', visibility: 'ORGANIZATION' },
    });
    const answerId = await seedAnswer(organizationId, legacy.id, null);

    await expectReadable(organizationId, legacy.id, answerId, member, 200);

    const detail = await http()
      .get(`/organizations/${organizationId}/conversations/${legacy.id}`)
      .set(bearer(member))
      .expect(200);
    expect(detail.body.conversation).toMatchObject({
      createdBy: null,
      canEdit: true,
      canShare: false,
    });

    await share(organizationId, legacy.id, admin, 'PRIVATE').expect(404);
    await http()
      .delete(`/organizations/${organizationId}/conversations/${legacy.id}`)
      .set(bearer(member))
      .expect(404);
    await http()
      .delete(`/organizations/${organizationId}/conversations/${legacy.id}`)
      .set(bearer(admin))
      .expect(204);
  });

  it('lets a viewer own and share a conversation', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const viewer = await addMember(organizationId, 'VIEWER');
    const conversationId = await startConversation(organizationId, viewer);

    await share(organizationId, conversationId, viewer, 'ORGANIZATION').expect(
      200,
    );
    await http()
      .get(`/organizations/${organizationId}/conversations/${conversationId}`)
      .set(bearer(owner))
      .expect(200);
  });

  it('hides conversations across organizations', async () => {
    const owner = await registerUser();
    const organizationId = await createOrganization(owner);
    const otherOrganizationId = await createOrganization(owner);
    const conversationId = await startConversation(organizationId, owner);
    await share(organizationId, conversationId, owner, 'ORGANIZATION').expect(
      200,
    );

    await http()
      .get(
        `/organizations/${otherOrganizationId}/conversations/${conversationId}`,
      )
      .set(bearer(owner))
      .expect(404);
    await share(otherOrganizationId, conversationId, owner, 'PRIVATE').expect(
      404,
    );
  });
});

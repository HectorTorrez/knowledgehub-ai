import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RetrievalService } from '../src/retrieval/retrieval.service.js';
import { RETRIEVAL_QUESTIONS } from './questions.js';
import {
  meanReciprocalRank,
  recallAtK,
  reciprocalRank,
} from './retrieval-metrics.js';
import { seedCorpus } from './seed.js';

it('reports retrieval performance on the synthetic corpus', async () => {
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === 'test-only-openai-api-key'
  ) {
    throw new Error('A real OPENAI_API_KEY is required');
  }
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  let organizationId: string | undefined;
  try {
    await app.init();
    const prisma = app.get(PrismaService);
    organizationId = await seedCorpus(app, prisma);
    const retrieval = app.get(RetrievalService);
    const scores: { recall5: number; recall10: number; rr: number }[] = [];
    for (const item of RETRIEVAL_QUESTIONS) {
      const results = await retrieval.search({
        organizationId,
        text: item.question,
        limit: 10,
      });
      const expected = item.expected.map((page) => ({
        title: page.documentTitle,
        pageNumber: page.pageNumber,
      }));
      const score = {
        recall5: recallAtK(results, expected, 5),
        recall10: recallAtK(results, expected, 10),
        rr: reciprocalRank(results, expected),
      };
      scores.push(score);
      console.log(
        item.id,
        item.question,
        JSON.stringify({
          ...score,
          hits: results.map(({ title, pageNumber }) => ({ title, pageNumber })),
        }),
      );
    }
    process.stdout.write(
      JSON.stringify({
        questions: scores.length,
        recall5:
          scores.reduce((sum, score) => sum + score.recall5, 0) / scores.length,
        recall10:
          scores.reduce((sum, score) => sum + score.recall10, 0) /
          scores.length,
        mrr: meanReciprocalRank(scores.map((score) => score.rr)),
      }) + '\n',
    );
  } finally {
    if (organizationId)
      await app
        .get(PrismaService)
        .organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  }
}, 600_000);

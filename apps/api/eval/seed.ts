import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../src/embeddings/embedding-provider.port.js';
import { EMBEDDING_VECTOR_DIMENSIONS } from '../src/embeddings/embedding-policy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { allCorpusPages } from '../test/answers-eval/corpus.js';

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function seedCorpus(
  app: INestApplication,
  prisma: PrismaService,
): Promise<string> {
  const embeddings = app.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
  const pages = allCorpusPages();
  const vectors = await embeddings.embed(pages.map((page) => page.text));

  if (vectors.length !== pages.length) {
    throw new Error(
      `The embedding provider returned ${vectors.length} vectors for ${pages.length} pages`,
    );
  }

  const organization = await prisma.organization.create({
    data: { name: `answers-eval-${randomUUID()}` },
  });
  const documents = new Map<string, string>();

  try {
  for (const [index, page] of pages.entries()) {
    const vector = vectors[index];

    if (
      !vector ||
      vector.length !== EMBEDDING_VECTOR_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `The embedding provider returned an unexpected vector for "${page.documentTitle}" page ${page.pageNumber}`,
      );
    }

    let documentId = documents.get(page.documentTitle);

    if (!documentId) {
      const document = await prisma.document.create({
        data: {
          organizationId: organization.id,
          title: page.documentTitle,
          status: 'READY',
          generation: 1,
          contentType: 'text/plain',
          sizeBytes: page.text.length,
        },
      });

      documentId = document.id;
      documents.set(page.documentTitle, documentId);
    }

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "documentId", "organizationId", "documentGeneration",
         "pageNumber", "chunkIndex", "content", "characterCount",
         "embedding", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${documentId}::uuid,
        ${organization.id}::uuid,
        1,
        ${page.pageNumber},
        ${page.pageNumber - 1},
        ${page.text},
        ${page.text.length},
        ${vectorLiteral(vector)}::vector,
        now(),
        now()
      )
    `;
  }

  return organization.id;
  } catch (error) {
    await prisma.organization.deleteMany({ where: { id: organization.id } });
    throw error;
  }
}


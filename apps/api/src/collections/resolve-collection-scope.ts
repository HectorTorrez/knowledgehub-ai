import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

export async function resolveCollectionScope(
  prisma: PrismaService,
  organizationId: string,
  collectionIds: string[],
  documentIds?: string[],
): Promise<string[]> {
  const ids = [...new Set(collectionIds)];
  const count = await prisma.collection.count({
    where: { organizationId, id: { in: ids } },
  });
  if (count !== ids.length) throw new NotFoundException('Collection not found');
  const documents = await prisma.document.findMany({
    where: {
      organizationId,
      collections: { some: { organizationId, collectionId: { in: ids } } },
      ...(documentIds ? { id: { in: documentIds } } : {}),
    },
    select: { id: true },
  });
  return documents.map((document) => document.id);
}

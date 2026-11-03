import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  list(organizationId: string) {
    return this.prisma.collection.findMany({
      where: { organizationId },
      select: { id: true, name: true, color: true, _count: { select: { documents: true } } },
      orderBy: { name: 'asc' },
    }).then(rows => rows.map(({ _count, ...row }) => ({ ...row, documentCount: _count.documents })));
  }

  async create(context: OrganizationContext, input: { name: string; color: string }) {
    try {
      return await this.prisma.$transaction(async tx => {
        const collection = await tx.collection.create({ data: { ...input, organizationId: context.organizationId } });
        await this.activity.record(tx, { organizationId: context.organizationId, actorId: context.userId, action: 'COLLECTION_CREATED', targetType: 'collection', targetId: collection.id, metadata: { to: collection.name } });
        return { id: collection.id, name: collection.name, color: collection.color, documentCount: 0 };
      });
    } catch (error) { this.rethrow(error); }
  }

  async update(context: OrganizationContext, id: string, input: { name?: string; color?: string }) {
    try {
      return await this.prisma.$transaction(async tx => {
        const existing = await tx.collection.findFirst({ where: { id, organizationId: context.organizationId } });
        if (!existing) throw new NotFoundException();
        const result = await tx.collection.updateMany({ where: { id, organizationId: context.organizationId }, data: input });
        if (!result.count) throw new NotFoundException();
        if (input.name !== undefined && input.name !== existing.name) {
          await this.activity.record(tx, { organizationId: context.organizationId, actorId: context.userId, action: 'COLLECTION_RENAMED', targetType: 'collection', targetId: id, metadata: { from: existing.name, to: input.name } });
        }
        const collection = await tx.collection.findFirstOrThrow({ where: { id, organizationId: context.organizationId }, select: { id: true, name: true, color: true, _count: { select: { documents: true } } } });
        const { _count, ...row } = collection;
        return { ...row, documentCount: _count.documents };
      });
    } catch (error) { this.rethrow(error); }
  }

  async delete(context: OrganizationContext, id: string) {
    await this.prisma.$transaction(async tx => {
      const existing = await tx.collection.findFirst({ where: { id, organizationId: context.organizationId } });
      if (!existing) throw new NotFoundException();
      const result = await tx.collection.deleteMany({ where: { id, organizationId: context.organizationId } });
      if (!result.count) throw new NotFoundException();
      await this.activity.record(tx, { organizationId: context.organizationId, actorId: context.userId, action: 'COLLECTION_DELETED', targetType: 'collection', targetId: id, metadata: { from: existing.name } });
    });
  }

  async setDocumentCollections(organizationId: string, documentId: string, collectionIds: string[]) {
    await this.prisma.$transaction(async tx => {
      const document = await tx.document.findFirst({ where: { id: documentId, organizationId }, select: { id: true } });
      if (!document) throw new NotFoundException();
      const ids = [...new Set(collectionIds)];
      const count = await tx.collection.count({ where: { organizationId, id: { in: ids } } });
      if (count !== ids.length) throw new NotFoundException();
      await tx.documentCollection.deleteMany({ where: { organizationId, documentId } });
      await tx.documentCollection.createMany({ data: ids.map(collectionId => ({ organizationId, documentId, collectionId })) });
    });
  }

  private rethrow(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Collection name already exists');
    throw error;
  }
}

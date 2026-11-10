import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hasTenantScope } from './tenant-scope.js';

const tenantModels = new Set([
  'DocumentVersion',
  'Document',
  'Collection',
  'DocumentCollection',
  'DocumentProcessingJob',
  'DocumentExtraction',
  'DocumentChunk',
  'DocumentSummary',
  'DocumentFact',
  'Answer',
  'Conversation',
  'TenantUsage',
  'OrganizationInvitation',
  'OrganizationActivity',
]);
const guardedOperations = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly unscoped: PrismaClient;

  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
    this.unscoped = this;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (
              tenantModels.has(model) &&
              guardedOperations.has(operation) &&
              !hasTenantScope('where' in args ? args.where : undefined)
            ) {
              throw new Error(
                `${model}.${operation} requires an organizationId filter`,
              );
            }
            return query(args);
          },
        },
      },
    }) as this;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

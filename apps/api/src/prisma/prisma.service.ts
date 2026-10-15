import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Framework-facing database client.
 *
 * Thin wrapper over Prisma with no business logic: it only wires the Postgres
 * driver adapter to `DATABASE_URL` and manages the connection lifecycle. Queries
 * live in feature-level services.
 *
 * The connection is established lazily on first query, so the application (and
 * its `/health` endpoint) can start even when the database is unreachable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

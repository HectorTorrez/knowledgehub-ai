import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Provides a single, shared {@link PrismaService} for the whole application.
 *
 * Marked global so feature modules can inject it without re-importing this
 * module. This is the only place that knows about Prisma; feature modules
 * depend on the service, not on generated model types leaking outwards.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

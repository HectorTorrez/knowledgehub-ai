import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnswersModule } from './answers/answers.module.js';
import { SecurityAuditModule } from './audit/security-audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EmbeddingsModule } from './embeddings/embeddings.module.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RetrievalModule } from './retrieval/retrieval.module.js';
import { SearchModule } from './search/search.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SecurityAuditModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    DocumentsModule,
    ProcessingModule,
    RateLimitModule,
    EmbeddingsModule,
    RetrievalModule,
    SearchModule,
    AnswersModule,
    MetricsModule,
  ],
})
export class AppModule {}

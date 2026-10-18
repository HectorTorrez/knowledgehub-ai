import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { buildCorsOptions, resolveCorsOrigins } from './config/cors.js';
import { MetricsService } from './metrics/metrics.service.js';
import { createRequestLogger } from './metrics/request-logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const port = Number(config.get<string>('PORT') ?? 3001);
  const corsOrigins = resolveCorsOrigins(config.get<string>('CORS_ORIGIN'));

  app.use(cookieParser());
  app.use(createRequestLogger(app.get(MetricsService), new Logger('RequestLogger')));

  app.enableCors(buildCorsOptions(corsOrigins));

  await app.listen(port);
}

await bootstrap();

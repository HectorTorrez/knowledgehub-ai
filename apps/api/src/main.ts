import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { buildCorsOptions, resolveCorsOrigins } from './config/cors.js';
import { resolveTrustProxy } from './config/trust-proxy.js';
import { MetricsService } from './metrics/metrics.service.js';
import { createRequestLogger } from './metrics/request-logger.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const port = Number(config.get<string>('PORT') ?? 3001);
  const corsOrigins = resolveCorsOrigins(config.get<string>('CORS_ORIGIN'));

  app.set(
    'trust proxy',
    resolveTrustProxy(config.get<string>('TRUST_PROXY')),
  );

  app.use(helmet());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
  app.use(createRequestLogger(app.get(MetricsService), new Logger('RequestLogger')));

  app.enableCors(buildCorsOptions(corsOrigins));

  await app.listen(port);
}

await bootstrap();

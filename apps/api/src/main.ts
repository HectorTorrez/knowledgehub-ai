import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { buildCorsOptions, resolveCorsOrigins } from './config/cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const port = Number(config.get<string>('PORT') ?? 3001);
  const corsOrigins = resolveCorsOrigins(config.get<string>('CORS_ORIGIN'));

  // Parses the `Cookie` header so the session guard can read the access token.
  app.use(cookieParser());

  // Explicit allow-list rather than a wildcard, because credentials are enabled.
  // The CSRF header is explicitly permitted (see buildCorsOptions).
  app.enableCors(buildCorsOptions(corsOrigins));

  await app.listen(port);
}

await bootstrap();

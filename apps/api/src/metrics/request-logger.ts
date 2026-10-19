import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import type { OrganizationRequest } from '../organizations/organization-context.js';
import type { MetricsService } from './metrics.service.js';

type RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => void;

export function createRequestLogger(
  metrics: MetricsService,
  logger: Logger,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader('X-Request-Id', requestId);

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const statusCode = response.statusCode;
      const labels = {
        method: request.method,
        status_code: String(statusCode),
      };

      metrics.increment('http_requests_total', labels);
      metrics.observe(
        'http_request_duration_seconds',
        labels,
        durationMs / 1000,
      );

      const auth = (request as AuthenticatedRequest).auth;
      const organizationContext = (request as OrganizationRequest)
        .organizationContext;

      logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.path,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          userId: auth?.userId,
          organizationId: organizationContext?.organizationId,
        }),
      );
    });

    next();
  };
}

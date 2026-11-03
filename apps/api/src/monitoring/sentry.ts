import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

const organizationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    tags: typeof event.tags?.organizationId === 'string' && organizationIdPattern.test(event.tags.organizationId) ? { organizationId: event.tags.organizationId } : undefined,
    exception: {
      values: event.exception?.values?.map((exception) => ({
        type: ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError'].includes(exception.type ?? '') ? exception.type : 'Error',
        stacktrace: {
          frames: exception.stacktrace?.frames?.map((frame) => ({
            lineno: frame.lineno,
            colno: frame.colno,
          })),
        },
      })),
    },
  };
}

export function initializeSentry(dsn: string | undefined, environment?: string, tracesSampleRate = 0) {
  if (!dsn) return;
  Sentry.init({ dsn, environment, tracesSampleRate, sendDefaultPii: false, defaultIntegrations: false, beforeSend: scrubEvent });
}

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const request = host.switchToHttp().getRequest<{ params?: { organizationId?: string } }>();
      Sentry.withScope((scope) => {
        if (request.params?.organizationId && organizationIdPattern.test(request.params.organizationId)) scope.setTag('organizationId', request.params.organizationId);
        Sentry.captureException(exception);
      });
    }
    super.catch(exception, host);
  }
}

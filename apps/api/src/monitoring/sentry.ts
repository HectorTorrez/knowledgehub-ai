import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

const organizationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function organizationTag(value: unknown): { organizationId: string } | undefined {
  return typeof value === 'string' && organizationIdPattern.test(value)
    ? { organizationId: value }
    : undefined;
}

const IDENTIFIER = /^[A-Za-z_$][\w$.]*$/;

function withoutQuery(filename: string | undefined): string | undefined {
  return filename?.split(/[?#]/, 1)[0];
}

function exceptionType(type: string | undefined): string {
  return type && IDENTIFIER.test(type) ? type : 'Error';
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    tags: organizationTag(event.tags?.organizationId),
    exception: {
      values: event.exception?.values?.map((exception) => ({
        type: exceptionType(exception.type),
        stacktrace: {
          frames: exception.stacktrace?.frames?.map((frame) => ({
            filename: withoutQuery(frame.filename),
            function: frame.function,
            module: frame.module,
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
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

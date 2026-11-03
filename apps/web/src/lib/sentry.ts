import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

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

let initialized = false;
export function initializeSentry(dsn: string | undefined) {
  if (!dsn || initialized || typeof window === 'undefined') return;
  Sentry.init({ dsn, sendDefaultPii: false, defaultIntegrations: false, beforeSend: scrubEvent });
  initialized = true;
}

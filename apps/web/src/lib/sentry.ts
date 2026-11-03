import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
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

let initialized = false;
export function initializeSentry(dsn: string | undefined) {
  if (!dsn || initialized || typeof window === 'undefined') return;
  Sentry.init({ dsn, sendDefaultPii: false, defaultIntegrations: false, beforeSend: scrubEvent });
  initialized = true;
}

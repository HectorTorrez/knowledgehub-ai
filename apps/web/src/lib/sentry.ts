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
        type: exception.type,
        stacktrace: {
          frames: exception.stacktrace?.frames?.map((frame) => ({
            filename: frame.filename?.split('?')[0],
            function: frame.function,
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

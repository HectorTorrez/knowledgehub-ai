import { LoaderCircle } from 'lucide-react';
import { Brand } from '~/components/brand';
import { isApiError, isRateLimited } from '~/lib/api/errors';

export function RoutePending() {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <Brand />
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        Loading…
      </span>
    </div>
  );
}

export function ErrorNotice({ error }: Readonly<{ error: unknown }>) {
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  const validationErrors = isApiError(error) ? error.validationErrors : [];
  const retryAfterSeconds = isRateLimited(error)
    ? error.retryAfterSeconds
    : undefined;

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="font-medium text-destructive">{message}</p>
      {retryAfterSeconds !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {retryMessage(retryAfterSeconds)}
        </p>
      ) : null}
      {validationErrors.length > 1 ? (
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          {validationErrors.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function retryMessage(seconds: number): string {
  if (seconds <= 0) {
    return 'You can try again now.';
  }

  if (seconds < 60) {
    return `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

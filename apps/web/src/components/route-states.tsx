import { LoaderCircle } from 'lucide-react';
import { Brand } from '~/components/brand';
import { isApiError } from '~/lib/api/errors';

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

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="font-medium text-destructive">{message}</p>
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

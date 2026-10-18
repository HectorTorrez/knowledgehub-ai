import { isApiError } from '~/lib/api/errors';

export function RouteMessage({
  title,
  description,
}: Readonly<{ title: string; description?: string }>) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
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

import type { ErrorComponentProps } from '@tanstack/react-router';

export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : 'Unexpected error';

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 inline-block text-sm underline"
      >
        Try again
      </button>
    </div>
  );
}

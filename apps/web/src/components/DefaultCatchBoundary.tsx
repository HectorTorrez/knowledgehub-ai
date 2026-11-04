import { captureException } from '@sentry/react';
import { useEffect } from 'react';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import { useT } from '~/lib/i18n/hooks';

export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps) {
  const t = useT();

  useEffect(() => {
    captureException(error);
  }, [error]);

  const message =
    error instanceof Error ? error.message : t('boundary.unexpected');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Brand />
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('boundary.title')}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <Button onClick={() => reset()}>{t('common.tryAgain')}</Button>
    </main>
  );
}

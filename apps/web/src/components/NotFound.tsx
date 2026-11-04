import { Link } from '@tanstack/react-router';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import { useT } from '~/lib/i18n/hooks';

export function NotFound() {
  const t = useT();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Brand />
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('notFound.title')}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('notFound.description')}
        </p>
      </div>
      <Button asChild>
        <Link to="/">{t('notFound.backHome')}</Link>
      </Button>
    </main>
  );
}

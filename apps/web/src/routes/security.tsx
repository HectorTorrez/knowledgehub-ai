import { createFileRoute, Link } from '@tanstack/react-router';
import { LanguageSwitcher } from '~/components/language-switcher';
import { Brand } from '~/components/brand';
import { useT } from '~/lib/i18n/provider';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/security')({
  head: ({ match }) =>
    pageHead({
      title: createTranslator(match.context.locale)('security.pageTitle'),
      path: '/security',
    }),
  component: SecurityPage,
});

const securityItems = ['access', 'files', 'sessions', 'ai'] as const;

function SecurityPage() {
  const t = useT();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5"
          aria-label={t('common.mainNavigation')}
        >
          <Brand />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm hover:text-brand">
              {t('security.logIn')}
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            {t('security.eyebrow')}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            {t('security.title')}
          </h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {securityItems.map((key) => (
            <section key={key} className="rounded-xl border bg-card p-6">
              <h2 className="font-semibold">
                {t(`security.items.${key}.title`)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`security.items.${key}.text`)}
              </p>
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-8">
          <Brand />
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t('security.home')}
          </Link>
        </div>
      </footer>
    </div>
  );
}

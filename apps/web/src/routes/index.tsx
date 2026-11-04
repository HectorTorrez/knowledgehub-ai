import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import {
  ArrowRight,
  BookOpen,
  FileSearch,
  Files,
  LockKeyhole,
  Sparkles,
  Users,
} from 'lucide-react';
import { Brand } from '~/components/brand';
import { LanguageSwitcher } from '~/components/language-switcher';
import { Button } from '~/components/ui/button';
import { useLogin } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { sessionQuery } from '~/lib/auth/session';
import { DEMO_ACCOUNT } from '~/lib/demo-account';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/')({
  ssr: false,
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('seo.defaultTitle'),
      description: t('seo.description'),
      path: '/',
    });
  },
  beforeLoad: async ({ context, location }) => {
    if (location.hash === 'pricing') return;
    const state = await context.queryClient
      .fetchQuery(sessionQuery)
      .catch(() => null);
    if (state?.status === 'authenticated')
      throw redirect({ to: '/organizations' });
  },
  component: LandingPage,
});

const featureIcons = [
  { key: 'answers', icon: Sparkles },
  { key: 'search', icon: FileSearch },
  { key: 'insights', icon: BookOpen },
  { key: 'workspaces', icon: Users },
  { key: 'documents', icon: Files },
] as const;

const howItWorksSteps = [
  { number: '01', key: 'create' },
  { number: '02', key: 'upload' },
  { number: '03', key: 'ask' },
] as const;

const pricingPlans = [
  {
    id: 'free',
    price: 'free',
    href: '/register',
    cta: 'getStarted',
    features: ['citedAnswers', 'documentSearch', 'organizationWorkspace'],
  },
  {
    id: 'team',
    price: 'comingSoon',
    href: '/register?plan=team',
    cta: 'talkToUs',
    features: ['teamCollaboration', 'sharedKnowledge'],
  },
  {
    id: 'enterprise',
    price: 'comingSoon',
    href: '/register',
    cta: 'talkToUs',
    features: ['organizationWorkspaces', 'knowledgeDiscovery'],
  },
] as const;

function LandingPage() {
  const t = useT();
  const login = useLogin();
  const router = useRouter();
  const reportError = useReportError();
  async function openDemo() {
    try {
      await login.mutateAsync(DEMO_ACCOUNT);
      const { organizations } = await organizationsApi.list();
      const organization = organizations.find(
        (item) => item.name === 'Northwind Labs',
      );
      if (organization) {
        await router.navigate({
          to: '/organizations/$organizationId',
          params: { organizationId: organization.id },
        });
      } else {
        await router.navigate({ to: '/organizations' });
      }
    } catch (error) {
      reportError(error);
    }
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <nav
          aria-label={t('common.mainNavigation')}
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5"
        >
          <Brand />
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a
              className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#features"
            >
              {t('landing.nav.features')}
            </a>
            <a
              className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#how-it-works"
            >
              {t('landing.nav.howItWorks')}
            </a>
            <a
              className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#pricing"
            >
              {t('landing.nav.pricing')}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost">
              <Link to="/login">{t('landing.nav.logIn')}</Link>
            </Button>
            <Button asChild>
              <Link to="/register">{t('landing.nav.getStarted')}</Link>
            </Button>
          </div>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:py-32">
          <div className="space-y-7">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              {t('landing.hero.eyebrow')}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              {t('landing.hero.title')}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t('landing.hero.description')}
            </p>
            <div className="flex flex-wrap gap-3">
              {import.meta.env.VITE_DEMO_ENABLED === 'true' && (
                <Button
                  size="lg"
                  onClick={() => void openDemo()}
                  disabled={login.isPending}
                >
                  {login.isPending
                    ? t('landing.hero.openingDemo')
                    : t('landing.hero.tryDemo')}{' '}
                  <ArrowRight />
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <Link to="/register">
                  {t('landing.hero.createFreeAccount')}
                </Link>
              </Button>
            </div>
          </div>
          <div
            className="rounded-2xl border bg-card p-4 shadow-xl sm:p-6"
            aria-label={t('landing.sample.label')}
          >
            <div className="flex items-center gap-2 border-b pb-4 text-sm font-semibold">
              <Sparkles className="size-4 text-brand" />{' '}
              {t('landing.sample.heading')}
            </div>
            <div className="mt-6 space-y-5 text-sm">
              <div className="ml-auto max-w-[85%] rounded-xl bg-muted p-4">
                {t('landing.sample.question')}
              </div>
              <div className="space-y-3 rounded-xl border p-4 leading-relaxed">
                <p className="font-semibold">{t('landing.sample.answer')}</p>
                <p>
                  {t('landing.sample.text')}{' '}
                  <span className="text-brand">[1]</span>
                </p>
                <div className="rounded-md bg-muted p-3 text-xs">
                  <span className="font-semibold">
                    [1] {t('landing.sample.source')}
                  </span>
                  <p className="mt-1 text-muted-foreground">
                    {t('landing.sample.quote')}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border px-4 py-3 text-muted-foreground">
                {t('landing.sample.placeholder')}
              </div>
            </div>
          </div>
        </section>
        <section id="features" className="border-y bg-muted/30">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">
              {t('landing.features.title')}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t('landing.features.description')}
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureIcons.map(({ key, icon: Icon }) => (
                <article key={key} className="rounded-xl border bg-card p-6">
                  <Icon className="size-6 text-brand" />
                  <h3 className="mt-5 font-semibold">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(`landing.features.${key}.text`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">
            {t('landing.howItWorks.title')}
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {howItWorksSteps.map(({ number, key }) => (
              <div key={number}>
                <p className="text-sm font-semibold text-brand">{number}</p>
                <h3 className="mt-3 text-xl font-semibold">
                  {t(`landing.howItWorks.${key}Title`)}
                </h3>
                <p className="mt-2 text-muted-foreground">
                  {t(`landing.howItWorks.${key}Text`)}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="border-y bg-muted/30">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-16 sm:flex-row sm:gap-8">
            <LockKeyhole className="size-8 shrink-0 text-brand" />
            <div>
              <h2 className="text-2xl font-semibold">
                {t('landing.isolation.title')}
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                {t('landing.isolation.text')}
              </p>
            </div>
          </div>
        </section>
        <section id="pricing" className="mx-auto max-w-7xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">
            {t('landing.pricing.title')}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <article key={plan.id} className="rounded-xl border bg-card p-6">
                <h3 className="text-xl font-semibold">
                  {t(`landing.pricing.plans.${plan.id}`)}
                </h3>
                <p className="mt-3 text-muted-foreground">
                  {plan.price === 'free'
                    ? t('landing.pricing.free')
                    : t('landing.pricing.comingSoon')}
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      {t(`landing.pricing.features.${feature}`)}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6">
                  <a href={plan.href}>
                    {plan.cta === 'getStarted'
                      ? t('landing.pricing.getStarted')
                      : t('landing.pricing.talkToUs')}
                  </a>
                </Button>
              </article>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-20">
          <div className="rounded-2xl bg-primary p-8 text-primary-foreground sm:p-12">
            <h2 className="text-3xl font-semibold">{t('landing.cta.title')}</h2>
            <p className="mt-3 opacity-80">{t('landing.cta.description')}</p>
            <Button asChild variant="secondary" className="mt-6">
              <Link to="/register">
                {t('landing.cta.getStarted')} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <Brand />
          <p className="text-sm text-muted-foreground">
            {t('landing.footer.tagline')}
          </p>
          <Link
            to="/security"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t('landing.footer.security')}
          </Link>
        </div>
      </footer>
    </div>
  );
}

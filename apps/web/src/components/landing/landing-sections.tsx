import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FileUp,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '~/components/brand';
import { SectionHeading } from '~/components/landing/section-heading';
import { Button } from '~/components/ui/button';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const howItWorksSteps = [
  { key: 'create', icon: Building2 },
  { key: 'upload', icon: FileUp },
  { key: 'ask', icon: MessageSquareText },
] as const;

const securityPoints = ['membership', 'roles', 'files', 'audit'] as const;

const pricingPlans = [
  {
    id: 'free',
    available: true,
    href: '/register',
    features: ['citedAnswers', 'documentSearch', 'organizationWorkspace'],
  },
  {
    id: 'team',
    available: false,
    href: '/register?plan=team',
    features: ['teamCollaboration', 'sharedKnowledge'],
  },
  {
    id: 'enterprise',
    available: false,
    href: '/register',
    features: ['organizationWorkspaces', 'knowledgeDiscovery'],
  },
] as const;

const faqItems = ['formats', 'citations', 'access', 'price'] as const;

export function LandingHowItWorks() {
  const t = useT();
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-24">
        <SectionHeading
          eyebrow={t('landing.howItWorks.eyebrow')}
          title={t('landing.howItWorks.title')}
        />
        <div className="relative mt-14">
          <div
            aria-hidden="true"
            className="absolute top-6 right-[16.66%] left-[16.66%] hidden h-px bg-gradient-to-r from-brand/0 via-brand/40 to-brand/0 md:block"
          />
          <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
            {howItWorksSteps.map(({ key, icon: Icon }, index) => (
              <li key={key} className="relative text-center">
                <span className="relative mx-auto flex size-12 items-center justify-center rounded-2xl border bg-card text-brand shadow-sm">
                  <Icon className="size-5" />
                  <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-brand text-[0.65rem] font-semibold text-brand-foreground">
                    {index + 1}
                  </span>
                </span>
                <h3 className="mt-5 text-lg font-semibold">
                  {t(`landing.howItWorks.${key}Title`)}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-muted-foreground">
                  {t(`landing.howItWorks.${key}Text`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function LandingSecurity() {
  const t = useT();
  return (
    <section id="security" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="start"
            eyebrow={t('landing.isolation.eyebrow')}
            title={t('landing.isolation.title')}
            description={t('landing.isolation.text')}
          />
          <Button asChild variant="link" className="mt-4 px-0">
            <Link to="/security">
              {t('landing.isolation.learnMore')} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="relative rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <span className="absolute -top-5 left-6 flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-lg shadow-brand/20 sm:left-8">
            <LockKeyhole className="size-5" />
          </span>
          <ul className="mt-2 space-y-5">
            {securityPoints.map((point) => (
              <li key={point} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
                <span>{t(`landing.isolation.points.${point}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function LandingPricing() {
  const t = useT();
  return (
    <section id="pricing" className="scroll-mt-20 border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('landing.pricing.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('landing.pricing.description')}
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan) => (
            <article
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-card p-8',
                plan.available &&
                  'border-brand/50 shadow-xl shadow-brand/10 ring-1 ring-brand/30',
              )}
            >
              {plan.available && (
                <p className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-brand-foreground">
                  {t('landing.pricing.available')}
                </p>
              )}
              <h3 className="text-lg font-semibold">
                {t(`landing.pricing.plans.${plan.id}`)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`landing.pricing.summaries.${plan.id}`)}
              </p>
              <p className="mt-6 text-3xl font-semibold tracking-tight">
                {plan.available
                  ? t('landing.pricing.freePrice')
                  : t('landing.pricing.comingSoon')}
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-brand" />
                    {t(`landing.pricing.features.${feature}`)}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-8"
                variant={plan.available ? 'default' : 'outline'}
              >
                <a href={plan.href}>
                  {plan.available
                    ? t('landing.pricing.getStarted')
                    : t('landing.pricing.talkToUs')}
                </a>
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFaq() {
  const t = useT();
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-5 py-24">
        <SectionHeading
          eyebrow={t('landing.faq.eyebrow')}
          title={t('landing.faq.title')}
        />
        <div className="mt-12 divide-y rounded-2xl border bg-card">
          {faqItems.map((item) => (
            <details key={item} className="group px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {t(`landing.faq.${item}.question`)}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 leading-relaxed text-muted-foreground">
                {t(`landing.faq.${item}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingCta() {
  const t = useT();
  return (
    <section className="mx-auto max-w-7xl px-5 pb-24">
      <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgb(255_255_255/0.18),transparent_45%),radial-gradient(circle_at_80%_100%,rgb(255_255_255/0.12),transparent_40%)]"
        />
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('landing.cta.title')}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg opacity-85">
          {t('landing.cta.description')}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link to="/register">
              {t('landing.cta.getStarted')} <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/login">{t('landing.cta.logIn')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  const t = useT();
  const linkClass =
    'text-sm text-muted-foreground transition-colors hover:text-foreground';
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm text-muted-foreground">
            {t('landing.footer.tagline')}
          </p>
        </div>
        <nav aria-label={t('landing.footer.product')} className="space-y-3">
          <p className="text-sm font-semibold">{t('landing.footer.product')}</p>
          <ul className="space-y-2">
            <li>
              <a className={linkClass} href="#features">
                {t('landing.nav.features')}
              </a>
            </li>
            <li>
              <a className={linkClass} href="#faq">
                {t('landing.nav.faq')}
              </a>
            </li>
            <li>
              <Link className={linkClass} to="/security">
                {t('landing.footer.security')}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t('landing.footer.account')} className="space-y-3">
          <p className="text-sm font-semibold">{t('landing.footer.account')}</p>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} to="/login">
                {t('landing.footer.logIn')}
              </Link>
            </li>
            <li>
              <Link className={linkClass} to="/register">
                {t('landing.footer.register')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-muted-foreground">
          {t('landing.footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}

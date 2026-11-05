import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FileUp,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '~/components/brand';
import {
  Crosshair,
  FrameSection,
  primaryAction,
  secondaryAction,
} from '~/components/landing/frame';
import { SectionHeading } from '~/components/landing/section-heading';
import { RequestCheckpoints } from '~/components/security/request-checkpoints';
import { Button } from '~/components/ui/button';
import { CONTACT_EMAIL_HREF } from '~/lib/contact';
import { useInView } from '~/hooks/use-in-view';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const howItWorksSteps = [
  { key: 'create', icon: Building2 },
  { key: 'upload', icon: FileUp },
  { key: 'ask', icon: MessageSquareText },
] as const;

const securityPoints = ['membership', 'roles', 'files', 'audit'] as const;

const freePlanFeatures = [
  'citedAnswers',
  'documentSearch',
  'organizationWorkspace',
] as const;

const faqItems = ['formats', 'citations', 'access', 'model', 'price'] as const;

export function LandingHowItWorks() {
  const t = useT();
  const [ref, inView] = useInView<HTMLOListElement>(0.35);
  return (
    <FrameSection id="how-it-works">
      <div className="px-5 pt-20 pb-14 sm:px-8 lg:px-10 lg:pt-28 lg:pb-16">
        <SectionHeading align="start" title={t('landing.howItWorks.title')} />
      </div>
      <div className="relative overflow-hidden border-t">
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0 left-0 hidden h-0.5 w-full bg-brand md:block',
            inView && 'kh-draw',
          )}
        />
        <ol ref={ref} className="-mr-px grid md:grid-cols-3">
          {howItWorksSteps.map(({ key, icon: Icon }, index) => (
            <li
              key={key}
              className="relative flex flex-col border-r border-b px-5 pt-8 pb-10 sm:px-8 md:border-b-0 lg:px-10 lg:pt-10 lg:pb-14"
            >
              <div className="flex items-start justify-between">
                <span className="text-6xl leading-none font-semibold tracking-[-0.04em] text-brand lg:text-7xl">
                  {index + 1}
                </span>
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-14 text-xl font-semibold tracking-[-0.02em]">
                {t(`landing.howItWorks.${key}Title`)}
              </h3>
              <p className="mt-2 max-w-xs leading-relaxed text-muted-foreground">
                {t(`landing.howItWorks.${key}Text`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </FrameSection>
  );
}

function AnimatedCheckpoints() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref}>
      <RequestCheckpoints
        key={String(inView)}
        animated={inView}
        showEndpoint={false}
        className="rounded-none shadow-none"
      />
    </div>
  );
}

export function LandingSecurity() {
  const t = useT();
  return (
    <FrameSection id="security">
      <div className="grid lg:grid-cols-2">
        <div className="px-5 py-20 sm:px-8 lg:border-r lg:px-10 lg:py-28">
          <SectionHeading
            align="start"
            title={t('landing.isolation.title')}
            description={t('landing.isolation.text')}
          />
          <ul className="mt-10 border-t">
            {securityPoints.map((point) => (
              <li
                key={point}
                className="flex gap-3 border-b py-3.5 text-[0.95rem]"
              >
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{t(`landing.isolation.points.${point}`)}</span>
              </li>
            ))}
          </ul>
          <Button
            asChild
            variant="outline"
            className={cn('mt-10', secondaryAction)}
          >
            <Link to="/security">
              {t('landing.isolation.learnMore')} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="marketing-rules flex items-center border-t px-5 py-14 sm:px-8 lg:border-t-0 lg:px-12">
          <div className="w-full">
            <AnimatedCheckpoints />
          </div>
        </div>
      </div>
    </FrameSection>
  );
}

export function LandingPricing() {
  const t = useT();
  return (
    <FrameSection id="pricing">
      <div className="px-5 pt-20 pb-14 sm:px-8 lg:px-10 lg:pt-28 lg:pb-16">
        <SectionHeading
          align="start"
          title={t('landing.pricing.title')}
          description={t('landing.pricing.description')}
        />
      </div>
      <div className="overflow-hidden border-t">
        <div className="-mr-px -mb-px grid md:grid-cols-2">
          <article className="flex flex-col border-r border-b bg-card px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">
                {t('landing.pricing.plans.free')}
              </h3>
              <span className="font-geist-mono text-xs text-muted-foreground">
                {t('landing.pricing.period')}
              </span>
            </div>
            <p className="mt-2 text-muted-foreground">
              {t('landing.pricing.summaries.free')}
            </p>
            <p className="mt-10 text-8xl leading-none font-semibold tracking-[-0.04em]">
              {t('landing.pricing.freePrice')}
            </p>
            <ul className="mt-10 border-t">
              {freePlanFeatures.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-3 border-b py-3"
                >
                  <Check className="size-4 shrink-0 text-brand" />
                  {t(`landing.pricing.features.${feature}`)}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className={cn('mt-10', primaryAction)}>
              <Link to="/register">{t('landing.pricing.getStarted')}</Link>
            </Button>
          </article>
          <article className="flex flex-col border-r border-b px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">
                {t('landing.pricing.plans.team')}
              </h3>
              <span className="border border-dashed border-foreground/30 px-2 py-0.5 text-xs font-medium">
                {t('landing.pricing.soon')}
              </span>
            </div>
            <p className="mt-2 max-w-sm leading-relaxed text-muted-foreground">
              {t('landing.pricing.waitlistText')}
            </p>
            <Button
              asChild
              size="lg"
              variant="outline"
              className={cn('mt-10 lg:mt-auto', secondaryAction)}
            >
              <a href={CONTACT_EMAIL_HREF}>
                {t('landing.pricing.waitlistAction')}
              </a>
            </Button>
          </article>
        </div>
      </div>
    </FrameSection>
  );
}

export function LandingFaq() {
  const t = useT();
  return (
    <FrameSection id="faq">
      <div className="grid lg:grid-cols-12">
        <div className="px-5 pt-20 pb-10 sm:px-8 lg:col-span-5 lg:border-r lg:px-10 lg:py-28">
          <div className="lg:sticky lg:top-28">
            <SectionHeading align="start" title={t('landing.faq.title')} />
          </div>
        </div>
        <div className="border-t lg:col-span-7 lg:border-t-0 lg:py-20">
          {faqItems.map((item) => (
            <details
              key={item}
              className="group border-b px-5 sm:px-8 lg:px-10 lg:first:border-t"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium tracking-[-0.01em] transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {t(`landing.faq.${item}.question`)}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-muted-foreground">
                {t(`landing.faq.${item}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </FrameSection>
  );
}

export function LandingCta() {
  const t = useT();
  return (
    <section className="border-t bg-brand text-brand-foreground [--border:color-mix(in_oklch,var(--brand-foreground)_22%,transparent)]">
      <div className="marketing-rules relative mx-auto max-w-7xl border-x px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <Crosshair className="-top-[7px] -left-[7px] [&>span]:bg-brand-foreground/60" />
        <Crosshair className="-top-[7px] -right-[7px] [&>span]:bg-brand-foreground/60" />
        <h2 className="max-w-[14ch] text-5xl leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[5.5rem]">
          {t('landing.cta.title')}
        </h2>
        <p className="mt-6 max-w-xl text-lg opacity-85">
          {t('landing.cta.description')}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-brand-foreground text-brand shadow-none hover:bg-background hover:text-foreground"
          >
            <Link to="/register">
              {t('landing.cta.getStarted')} <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-brand-foreground/40 bg-transparent text-brand-foreground shadow-none hover:border-brand-foreground hover:bg-transparent hover:text-brand-foreground"
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
    'text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline';
  return (
    <footer className="overflow-hidden border-t">
      <div className="relative mx-auto grid max-w-7xl gap-10 border-x px-5 py-14 sm:grid-cols-[2fr_1fr_1fr] sm:px-8 lg:px-10">
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
              <a className={linkClass} href="/#features">
                {t('landing.nav.features')}
              </a>
            </li>
            <li>
              <a className={linkClass} href="/#how-it-works">
                {t('landing.nav.howItWorks')}
              </a>
            </li>
            <li>
              <a className={linkClass} href="/#pricing">
                {t('landing.nav.pricing')}
              </a>
            </li>
            <li>
              <a className={linkClass} href="/#faq">
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
        <div className="mx-auto max-w-7xl border-x px-5 pt-8 sm:px-8 lg:px-10">
          <p className="text-xs text-muted-foreground">
            {t('landing.footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <svg
            aria-hidden="true"
            viewBox="0 0 1000 150"
            className="mt-6 block w-full fill-foreground/[0.07] select-none"
          >
            <text
              x="0"
              y="136"
              textLength="1000"
              lengthAdjust="spacingAndGlyphs"
              className="text-[178px] font-semibold tracking-[-0.04em]"
            >
              KnowledgeHub
            </text>
          </svg>
        </div>
      </div>
    </footer>
  );
}

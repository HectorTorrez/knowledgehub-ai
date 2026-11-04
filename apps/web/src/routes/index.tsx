import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  LandingFeatures,
  LandingFormats,
} from '~/components/landing/landing-features';
import { LandingHeader } from '~/components/landing/landing-header';
import { LandingHero } from '~/components/landing/landing-hero';
import {
  LandingCta,
  LandingFaq,
  LandingFooter,
  LandingHowItWorks,
  LandingPricing,
  LandingSecurity,
} from '~/components/landing/landing-sections';
import { sessionQuery } from '~/lib/auth/session';
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

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingFormats />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingSecurity />
        <LandingPricing />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}

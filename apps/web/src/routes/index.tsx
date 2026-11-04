import { createFileRoute, useLocation } from '@tanstack/react-router';
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
import { useRedirectSignedInVisitor } from '~/hooks/use-redirect-signed-in-visitor';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/')({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('seo.defaultTitle'),
      description: t('seo.description'),
      path: '/',
    });
  },
  component: LandingPage,
});

function LandingPage() {
  const hash = useLocation({ select: (location) => location.hash });
  useRedirectSignedInVisitor(hash === 'pricing' ? null : '/organizations');

  return (
    <div className="marketing min-h-screen">
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

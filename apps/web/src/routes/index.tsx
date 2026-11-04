import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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
  beforeLoad: ({ context, location }) => {
    if (location.hash === 'pricing') return;
    void context.queryClient.prefetchQuery(sessionQuery);
  },
  component: LandingPage,
});

function LandingPage() {
  const session = useQuery(sessionQuery);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const authenticated = session.data?.status === 'authenticated';

  useEffect(() => {
    if (authenticated && hash !== 'pricing') {
      void navigate({ to: '/organizations', replace: true });
    }
  }, [authenticated, hash, navigate]);

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

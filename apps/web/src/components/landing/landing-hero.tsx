import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ProductWindow } from '~/components/landing/product-window';
import { Button } from '~/components/ui/button';
import { useLogin } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { DEMO_ACCOUNT } from '~/lib/demo-account';
import { useT } from '~/lib/i18n/hooks';

const DEMO_ORGANIZATION_NAME = 'Northwind Labs';

function useOpenDemo() {
  const login = useLogin();
  const router = useRouter();
  const reportError = useReportError();
  const [isOpening, setIsOpening] = useState(false);

  async function openDemo() {
    setIsOpening(true);
    try {
      await login.mutateAsync(DEMO_ACCOUNT);
      const { organizations } = await organizationsApi.list();
      const organization = organizations.find(
        (item) => item.name === DEMO_ORGANIZATION_NAME,
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
      setIsOpening(false);
    }
  }

  return { openDemo, isOpening };
}

export function LandingHero() {
  const t = useT();
  const { openDemo, isOpening } = useOpenDemo();
  const demoEnabled = import.meta.env.VITE_DEMO_ENABLED === 'true';

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)] bg-[size:48px_48px] opacity-60"
      />
      <div className="mx-auto max-w-7xl px-5 pt-16 pb-20 sm:pt-24 lg:pb-28">
        <div className="landing-rise mx-auto max-w-4xl text-center">
          <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[3.5rem] lg:text-[4rem]">
            {t('landing.hero.titleLead')}
            <span className="block text-brand">
              {t('landing.hero.titleTail')}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {t('landing.hero.description')}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {demoEnabled && (
              <Button
                size="lg"
                onClick={() => void openDemo()}
                disabled={isOpening}
              >
                {isOpening
                  ? t('landing.hero.openingDemo')
                  : t('landing.hero.tryDemo')}
                <ArrowRight />
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant={demoEnabled ? 'outline' : 'default'}
            >
              <Link to="/register">
                {t('landing.hero.createFreeAccount')}
                {!demoEnabled && <ArrowRight />}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">{t('landing.hero.seeHow')}</a>
            </Button>
          </div>
        </div>
        <div className="landing-rise mt-16 [animation-delay:150ms] sm:mt-20">
          <ProductWindow />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('landing.hero.sampleNote')}
          </p>
        </div>
      </div>
    </section>
  );
}

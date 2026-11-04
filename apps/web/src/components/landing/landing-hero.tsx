import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { ProductPreview } from '~/components/landing/product-preview';
import { Button } from '~/components/ui/button';
import { useLogin } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { organizationsApi } from '~/lib/api/organizations';
import { DEMO_ACCOUNT } from '~/lib/demo-account';
import { useT } from '~/lib/i18n/hooks';

const DEMO_ORGANIZATION_NAME = 'Northwind Labs';

const heroPoints = ['cited', 'formats', 'private'] as const;

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
    <section>
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
        <div className="landing-rise space-y-8">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {t('landing.hero.titleLead')}{' '}
            <span className="text-brand">{t('landing.hero.titleAccent')}</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {t('landing.hero.description')}
          </p>
          <div className="flex flex-wrap gap-3">
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
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="size-4 text-success" />
                {t(`landing.hero.points.${point}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="landing-rise [animation-delay:150ms]">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

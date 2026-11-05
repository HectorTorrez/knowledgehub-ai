import { Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DocumentField } from '~/components/landing/document-field';
import {
  Crosshair,
  FrameCorners,
  primaryAction,
  secondaryAction,
} from '~/components/landing/frame';
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

const FIELD_FILES = ['contract', 'handbook', 'onboarding', 'kickoff'] as const;

function useFieldDocuments() {
  const t = useT();
  return useMemo(
    () => FIELD_FILES.map((file) => t(`landing.sample.files.${file}`)),
    [t],
  );
}

export function LandingHero() {
  const t = useT();
  const { openDemo, isOpening } = useOpenDemo();
  const demoEnabled = import.meta.env.VITE_DEMO_ENABLED === 'true';
  const fieldDocuments = useFieldDocuments();

  return (
    <section>
      <div className="relative mx-auto max-w-7xl border-x">
        <div className="landing-rise px-5 pt-12 pb-10 sm:px-8 sm:pt-16 lg:px-10 lg:pt-20 lg:pb-14">
          <h1 className="max-w-[20ch] text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.5rem]">
            {t('landing.hero.titleLead')}{' '}
            <span className="text-brand">{t('landing.hero.titleTail')}</span>
          </h1>
        </div>

        <div className="relative grid border-t lg:grid-cols-12">
          <Crosshair className="-top-[7px] -left-[7px]" />
          <Crosshair className="-top-[7px] -right-[7px]" />
          <div className="flex flex-col gap-10 px-5 py-10 sm:px-8 lg:col-span-5 lg:border-r lg:px-10 lg:py-12">
            <p className="max-w-md text-lg leading-relaxed text-pretty text-muted-foreground">
              {t('landing.hero.description')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {demoEnabled && (
                <Button
                  size="lg"
                  className={primaryAction}
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
                className={demoEnabled ? secondaryAction : primaryAction}
              >
                <Link to="/register">
                  {t('landing.hero.createFreeAccount')}
                  {!demoEnabled && <ArrowRight />}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="hover:bg-transparent hover:underline hover:underline-offset-4"
              >
                <a href="#how-it-works">{t('landing.hero.seeHow')}</a>
              </Button>
            </div>
          </div>
          <div className="relative min-h-[22rem] border-t sm:min-h-[26rem] lg:col-span-7 lg:border-t-0">
            <DocumentField
              documents={fieldDocuments}
              answerLabel={t('landing.sample.answer')}
              groundedLabel={t('landing.sample.grounded')}
              className="absolute inset-0 size-full"
            />
          </div>
        </div>
      </div>

      <div className="border-t">
        <div className="marketing-rules relative mx-auto max-w-7xl border-x px-3 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
          <FrameCorners />
          <div className="landing-rise [animation-delay:150ms]">
            <ProductWindow />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t('landing.hero.sampleNote')}
          </p>
        </div>
      </div>
    </section>
  );
}

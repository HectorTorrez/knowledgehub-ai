import { createFileRoute } from '@tanstack/react-router';
import { LandingHeader } from '~/components/landing/landing-header';
import { LandingFooter } from '~/components/landing/landing-sections';
import {
  SecurityAccounts,
  SecurityAi,
  SecurityAudit,
  SecurityFiles,
  SecurityHero,
  SecurityIsolation,
  SecurityReport,
  SecurityRoles,
} from '~/components/security/security-sections';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/security')({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('security.pageTitle'),
      description: t('security.description'),
      path: '/security',
    });
  },
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="marketing min-h-screen">
      <LandingHeader />
      <main>
        <SecurityHero />
        <SecurityIsolation />
        <SecurityRoles />
        <SecurityFiles />
        <SecurityAccounts />
        <SecurityAudit />
        <SecurityAi />
        <SecurityReport />
      </main>
      <LandingFooter />
    </div>
  );
}

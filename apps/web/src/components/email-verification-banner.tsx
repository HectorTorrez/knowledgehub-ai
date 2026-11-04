import type { PublicUser } from '@knowledgehub/shared-types';
import { MailWarning } from 'lucide-react';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { useResendVerificationEmail } from '~/hooks/use-auth';
import { useT } from '~/lib/i18n/hooks';

export function EmailVerificationBanner({
  user,
}: Readonly<{ user: PublicUser }>) {
  const t = useT();
  const resend = useResendVerificationEmail(user.email);

  return (
    <Alert variant="warning" className="mb-6">
      <MailWarning />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{t('emailBanner.message', { email: user.email })}</span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={resend.isPending || resend.isSuccess}
          onClick={() => resend.mutate()}
        >
          {resend.isPending
            ? t('emailBanner.sending')
            : t('emailBanner.resend')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

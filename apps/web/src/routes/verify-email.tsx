import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AuthLayout } from '~/components/auth-layout';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { accountApi } from '~/lib/api/account';
import { SESSION_QUERY_KEY } from '~/lib/auth/session';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';

type VerificationStatus = 'verifying' | 'verified' | 'invalid' | 'missing';

export const Route = createFileRoute('/verify-email')({
  ssr: false,
  head: ({ match }) => ({
    meta: [
      {
        title: createTranslator(match.context.locale)('verifyEmail.pageTitle'),
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token
        : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const t = useT();
  const { token } = Route.useSearch();
  const client = useQueryClient();
  const verify = useMutation({
    mutationFn: (value: string) => accountApi.verifyEmail(value),
    onSuccess: () => client.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });
  const { mutate } = verify;
  const requestedToken = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (token === undefined || requestedToken.current === token) {
      return;
    }
    requestedToken.current = token;
    mutate(token);
  }, [token, mutate]);

  const status = verificationStatus(token, verify);

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <StatusIcon status={status} />
            {
              {
                verifying: t('verifyEmail.title'),
                verified: t('verifyEmail.verified'),
                invalid: t('verifyEmail.invalid'),
                missing: t('verifyEmail.invalid'),
              }[status]
            }
          </CardTitle>
          <CardDescription aria-live="polite">
            {
              {
                verifying: t('verifyEmail.verifying'),
                verified: t('verifyEmail.verifiedDescription'),
                invalid: t('verifyEmail.invalidDescription'),
                missing: t('verifyEmail.missingToken'),
              }[status]
            }
          </CardDescription>
        </CardHeader>
        {status === 'verifying' ? null : (
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/organizations">{t('verifyEmail.continue')}</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </AuthLayout>
  );
}

function verificationStatus(
  token: string | undefined,
  verify: { isSuccess: boolean; isError: boolean },
): VerificationStatus {
  if (token === undefined) return 'missing';
  if (verify.isSuccess) return 'verified';
  if (verify.isError) return 'invalid';
  return 'verifying';
}

function StatusIcon({ status }: Readonly<{ status: VerificationStatus }>) {
  if (status === 'verified') {
    return <CircleCheck className="size-5 text-success" />;
  }
  if (status === 'verifying') {
    return (
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    );
  }
  return <CircleAlert className="size-5 text-destructive" />;
}

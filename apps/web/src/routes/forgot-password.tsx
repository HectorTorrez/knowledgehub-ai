import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link, useHydrated } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '~/components/auth-layout';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useReportError } from '~/hooks/use-error-toast';
import { accountApi } from '~/lib/api/account';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { forgotPasswordFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/forgot-password')({
  head: ({ match }) => ({
    meta: [
      {
        title: createTranslator(match.context.locale)(
          'forgotPassword.pageTitle',
        ),
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  const locale = useLocale();
  const isHydrated = useHydrated();
  const reportError = useReportError();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const requestReset = useMutation({
    mutationFn: (address: string) =>
      accountApi.requestPasswordReset({ email: address, locale }),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = forgotPasswordFormSchema(t).safeParse({ email });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await requestReset.mutateAsync(result.data.email);
    } catch (error) {
      reportError(error);
      return;
    }

    setSentTo(result.data.email);
  }

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      <Card>
        {sentTo === null ? (
          <>
            <CardHeader>
              <CardTitle className="text-xl">
                {t('forgotPassword.title')}
              </CardTitle>
              <CardDescription>
                {t('forgotPassword.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('fields.email')}</Label>
                  <Input
                    readOnly={!isHydrated}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!isHydrated || requestReset.isPending}
                >
                  {requestReset.isPending
                    ? t('forgotPassword.submitting')
                    : t('forgotPassword.submit')}
                </Button>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MailCheck className="size-5 text-success" />
                {t('forgotPassword.sentTitle')}
              </CardTitle>
              <CardDescription aria-live="polite">
                {t('forgotPassword.sentDescription', { email: sentTo })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSentTo(null)}
              >
                {t('forgotPassword.tryAnotherEmail')}
              </Button>
            </CardContent>
          </>
        )}
        <CardFooter>
          <Link
            to="/login"
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            {t('forgotPassword.backToLogin')}
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

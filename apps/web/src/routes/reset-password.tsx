import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link, useHydrated } from '@tanstack/react-router';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '~/components/auth-layout';
import { Brand } from '~/components/brand';
import { PasswordInput } from '~/components/password-input';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { useReportError } from '~/hooks/use-error-toast';
import { accountApi } from '~/lib/api/account';
import { isNotFound } from '~/lib/api/errors';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { PASSWORD_MIN_LENGTH, resetPasswordFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/reset-password')({
  ssr: false,
  head: ({ match }) => ({
    meta: [
      {
        title: createTranslator(match.context.locale)(
          'resetPassword.pageTitle',
        ),
      },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token
        : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const t = useT();
  const { token } = Route.useSearch();
  const reset = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      accountApi.resetPassword(input),
  });

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      <Card>
        {token === undefined ? (
          <InvalidLink description={t('resetPassword.missingToken')} />
        ) : reset.isSuccess ? (
          <PasswordChanged />
        ) : isNotFound(reset.error) ? (
          <InvalidLink description={t('resetPassword.invalidDescription')} />
        ) : (
          <NewPasswordForm
            isPending={reset.isPending}
            onSubmit={(password) => reset.mutateAsync({ token, password })}
          />
        )}
      </Card>
    </AuthLayout>
  );
}

function NewPasswordForm({
  isPending,
  onSubmit,
}: Readonly<{
  isPending: boolean;
  onSubmit: (password: string) => Promise<void>;
}>) {
  const t = useT();
  const isHydrated = useHydrated();
  const reportError = useReportError();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = resetPasswordFormSchema(t).safeParse({
      password,
      confirmPassword,
    });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await onSubmit(result.data.password);
    } catch (error) {
      if (!isNotFound(error)) {
        reportError(error);
      }
    }
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">{t('resetPassword.title')}</CardTitle>
        <CardDescription>{t('resetPassword.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">{t('resetPassword.newPassword')}</Label>
            <PasswordInput
              readOnly={!isHydrated}
              id="password"
              name="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={setPassword}
              describedBy="password-hint"
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              {t('auth.register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">
              {t('resetPassword.confirmPassword')}
            </Label>
            <PasswordInput
              readOnly={!isHydrated}
              id="confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!isHydrated || isPending}
          >
            {isPending
              ? t('resetPassword.submitting')
              : t('resetPassword.submit')}
          </Button>
        </form>
      </CardContent>
    </>
  );
}

function PasswordChanged() {
  const t = useT();

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CircleCheck className="size-5 text-success" />
          {t('resetPassword.doneTitle')}
        </CardTitle>
        <CardDescription aria-live="polite">
          {t('resetPassword.doneDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/login">{t('resetPassword.signIn')}</Link>
        </Button>
      </CardContent>
    </>
  );
}

function InvalidLink({ description }: Readonly<{ description: string }>) {
  const t = useT();

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CircleAlert className="size-5 text-destructive" />
          {t('resetPassword.invalid')}
        </CardTitle>
        <CardDescription aria-live="polite">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/forgot-password">{t('resetPassword.requestNew')}</Link>
        </Button>
      </CardContent>
    </>
  );
}

import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '~/components/auth-layout';
import { Brand } from '~/components/brand';
import { PasswordInput } from '~/components/password-input';
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
import { useToast } from '~/components/ui/toast';
import { useLogin } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { sessionQuery } from '~/lib/auth/session';
import { DEMO_ACCOUNT } from '~/lib/demo-account';
import { useT } from '~/lib/i18n/provider';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { loginFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/login')({
  ssr: false,
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('auth.login.pageTitle'),
      description: t('auth.login.pageDescription'),
      path: '/login',
    });
  },
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: toSameOriginPath(search.redirect),
  }),
  beforeLoad: async ({ context }) => {
    const state = await context.queryClient
      .fetchQuery(sessionQuery)
      .catch(() => null);

    if (state?.status === 'authenticated') {
      throw redirect({ to: '/organizations' });
    }
  },
  component: LoginPage,
});

function toSameOriginPath(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return undefined;
  }

  try {
    const url = new URL(value, 'https://knowledgehub.invalid');

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const router = useRouter();
  const login = useLogin();
  const { toast } = useToast();
  const reportError = useReportError();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function fillDemoCredentials() {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = loginFormSchema(t).safeParse({ email, password });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await login.mutateAsync(result.data);
    } catch (error) {
      reportError(error);
      return;
    }

    toast({ variant: 'success', title: t('auth.login.signedIn') });
    router.history.push(redirectTo ?? '/organizations');
  }

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border border-dashed bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {t('auth.login.exploringTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('auth.login.exploringDescription')}
            </p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t('fields.email')}</dt>
                <dd className="truncate">{DEMO_ACCOUNT.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t('fields.password')}
                </dt>
                <dd className="truncate">{DEMO_ACCOUNT.password}</dd>
              </div>
            </dl>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={fillDemoCredentials}
            >
              {t('auth.login.useDemoCredentials')}
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t('fields.email')}</Label>
              <Input
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
            <div className="space-y-2">
              <Label htmlFor="password">{t('fields.password')}</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending
                ? t('auth.login.submitting')
                : t('auth.login.submit')}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {t('auth.login.noAccount')}{' '}
            <Link
              to="/register"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {t('auth.login.createOne')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

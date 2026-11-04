import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
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
import { useRegister } from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { sessionQuery } from '~/lib/auth/session';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { cn } from '~/lib/utils';
import { PASSWORD_MIN_LENGTH, registerFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/register')({
  ssr: false,
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('auth.register.pageTitle'),
      description: t('auth.register.pageDescription'),
      path: '/register',
    });
  },
  beforeLoad: async ({ context }) => {
    const state = await context.queryClient
      .fetchQuery(sessionQuery)
      .catch(() => null);

    if (state?.status === 'authenticated') {
      throw redirect({ to: '/organizations' });
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const { toast } = useToast();
  const reportError = useReportError();
  const t = useT();
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const meetsMinimumLength = form.password.length >= PASSWORD_MIN_LENGTH;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = registerFormSchema(t).safeParse(form);

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await register.mutateAsync(result.data);
    } catch (error) {
      reportError(error);
      return;
    }

    toast({ variant: 'success', title: t('auth.register.created') });
    router.history.push('/organizations');
  }

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('auth.register.title')}</CardTitle>
          <CardDescription>{t('auth.register.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('fields.firstName')}</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  autoFocus
                  value={form.firstName}
                  onChange={(event) => update('firstName', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('fields.lastName')}</Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(event) => update('lastName', event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('fields.email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('fields.password')}</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(value) => update('password', value)}
                describedBy="password-hint"
              />
              <p
                id="password-hint"
                className={cn(
                  'flex items-center gap-1 text-xs',
                  meetsMinimumLength ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {meetsMinimumLength ? (
                  <CircleCheck className="size-3.5" />
                ) : null}
                {meetsMinimumLength
                  ? t('auth.register.passwordMet')
                  : t('auth.register.passwordHint', {
                      min: PASSWORD_MIN_LENGTH,
                    })}
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={register.isPending}
            >
              {register.isPending
                ? t('auth.register.submitting')
                : t('auth.register.submit')}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {t('auth.register.haveAccount')}{' '}
            <Link
              to="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {t('auth.login.submit')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

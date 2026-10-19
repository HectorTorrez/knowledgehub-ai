import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Brand } from '~/components/brand';
import { PasswordInput } from '~/components/password-input';
import { ErrorNotice } from '~/components/route-states';
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
import { useLogin } from '~/hooks/use-auth';
import { sessionQuery } from '~/lib/auth/session';
import { pageHead } from '~/lib/seo';
import { loginFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/login')({
  ssr: false,
  head: () =>
    pageHead({
      title: 'Sign in · KnowledgeHub AI',
      description:
        "Sign in to KnowledgeHub AI to search and ask questions across your organization's documents.",
      path: '/login',
    }),
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
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = loginFormSchema.safeParse({ email, password });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }

    try {
      await login.mutateAsync(result.data);
    } catch {
      return;
    }

    router.history.push(redirectTo ?? '/organizations');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Use your KnowledgeHub AI account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {validationError ? (
                <ErrorNotice error={new Error(validationError)} />
              ) : null}
              {login.isError ? <ErrorNotice error={login.error} /> : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={login.isPending}
              >
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              No account?{' '}
              <Link
                to="/register"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create one
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

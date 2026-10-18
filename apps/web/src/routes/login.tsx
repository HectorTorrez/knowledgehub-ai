import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { useLogin } from '~/hooks/use-auth';
import { sessionQuery } from '~/lib/auth/session';
import { loginFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/login')({
  ssr: false,
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
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Use your KnowledgeHub AI account.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        {validationError ? <ErrorNotice error={new Error(validationError)} /> : null}
        {login.isError ? <ErrorNotice error={login.error} /> : null}
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        No account?{' '}
        <Link to="/register" className="underline">
          Create one
        </Link>
      </p>
    </main>
  );
}

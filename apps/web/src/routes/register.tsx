import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { useRegister } from '~/hooks/use-auth';
import { sessionQuery } from '~/lib/auth/session';
import { registerFormSchema } from '~/lib/validation';

export const Route = createFileRoute('/register')({
  ssr: false,
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
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = registerFormSchema.safeParse(form);

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }

    try {
      await register.mutateAsync(result.data);
    } catch {
      return;
    }

    router.history.push('/organizations');
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        {validationError ? <ErrorNotice error={new Error(validationError)} /> : null}
        {register.isError ? <ErrorNotice error={register.error} /> : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="firstName" className="text-sm font-medium">
              First name
            </label>
            <input
              id="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(event) => update('firstName', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="lastName" className="text-sm font-medium">
              Last name
            </label>
            <input
              id="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(event) => update('lastName', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            At least 12 characters.
          </p>
        </div>
        <button
          type="submit"
          disabled={register.isPending}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {register.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}

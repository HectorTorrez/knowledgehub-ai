import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { useLogout, useSession } from '~/hooks/use-auth';

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSession();
  const signOut = useLogout();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<unknown>(null);

  const user =
    session.data?.status === 'authenticated' ? session.data.user : undefined;

  useEffect(() => {
    if (session.data?.status === 'unauthenticated') {
      void navigate({ to: '/login' });
    }
  }, [session.data, navigate]);

  async function handleSignOut() {
    setSignOutError(null);

    try {
      await signOut.mutateAsync();
    } catch (error) {
      setSignOutError(error);
      return;
    }

    await navigate({ to: '/login' });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4 text-sm">
            <Link to="/organizations" className="font-semibold">
              KnowledgeHub AI
            </Link>
            <Link
              to="/organizations"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: 'text-foreground' }}
            >
              Organizations
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <span className="text-muted-foreground">{user.email}</span>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signOut.isPending}
              className="rounded-md border px-3 py-1.5 hover:bg-accent disabled:opacity-60"
            >
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      {signOutError ? (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <ErrorNotice error={signOutError} />
        </div>
      ) : null}
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}

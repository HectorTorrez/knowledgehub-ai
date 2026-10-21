import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Brand } from '~/components/brand';
import { ErrorNotice } from '~/components/route-states';
import { ThemeToggle } from '~/components/theme-toggle';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useLogout, useSession } from '~/hooks/use-auth';
import { useWebMcpTools } from '~/hooks/use-webmcp-tools';

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSession();
  const signOut = useLogout();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<unknown>(null);

  useWebMcpTools();

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
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/organizations" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Brand />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {initialsFor(user.firstName, user.lastName, user.email)}
                    </span>
                    <span className="hidden text-sm sm:inline-block">
                      {displayNameFor(user.firstName, user.lastName, user.email)}
                    </span>
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span>
                      {displayNameFor(user.firstName, user.lastName, user.email)}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void handleSignOut()}
                    disabled={signOut.isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut />
                    {signOut.isPending ? 'Signing out…' : 'Sign out'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>
      {signOutError ? (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <ErrorNotice error={signOutError} />
        </div>
      ) : null}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6"
      >
        {children}
      </main>
    </div>
  );
}

function displayNameFor(
  firstName: string,
  lastName: string,
  email: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();

  return name.length > 0 ? name : email;
}

function initialsFor(
  firstName: string,
  lastName: string,
  email: string,
): string {
  const fromName = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.trim();

  return (fromName || (email[0] ?? '')).toUpperCase();
}

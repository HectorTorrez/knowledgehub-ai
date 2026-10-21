import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { KeyRound, Laptop, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { useSession } from '~/hooks/use-auth';
import { accountApi } from '~/lib/api/account';
import { SESSION_QUERY_KEY } from '~/lib/auth/session';
import { formatDateTime } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import {
  changePasswordFormSchema,
  profileFormSchema,
} from '~/lib/validation';

export const Route = createFileRoute('/_authenticated/settings')({
  head: () =>
    pageHead({
      title: 'Account settings · KnowledgeHub AI',
      description: 'Update your profile, password, and active sessions.',
      path: '/settings',
    }),
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const session = useSession();
  const user =
    session.data?.status === 'authenticated' ? session.data.user : undefined;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user !== undefined) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
  }, [user]);

  const sessions = useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: () => accountApi.sessions(),
  });

  const updateProfile = useMutation({
    mutationFn: (input: { firstName: string; lastName: string }) =>
      accountApi.updateProfile(input),
    onSuccess: (data) => {
      client.setQueryData(SESSION_QUERY_KEY, {
        status: 'authenticated',
        user: data.user,
      });
      toast({ variant: 'success', title: 'Profile updated' });
    },
  });

  const changePassword = useMutation({
    mutationFn: (input: {
      currentPassword: string;
      newPassword: string;
    }) => accountApi.changePassword(input),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({
        variant: 'success',
        title: 'Password changed',
        description: 'Your other sessions were signed out.',
      });
    },
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => accountApi.revokeSession(sessionId),
    onSuccess: () => {
      toast({ variant: 'success', title: 'Session signed out' });

      return sessions.refetch();
    },
  });

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);

    const result = profileFormSchema.safeParse({ firstName, lastName });

    if (!result.success) {
      setProfileError(result.error.issues[0]?.message ?? 'Invalid profile.');
      return;
    }

    try {
      await updateProfile.mutateAsync(result.data);
    } catch {
      return;
    }
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);

    const result = changePasswordFormSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!result.success) {
      setPasswordError(result.error.issues[0]?.message ?? 'Invalid password.');
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
      });
    } catch {
      return;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Account settings"
        description="Manage your profile, password, and signed-in devices."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            Profile
          </CardTitle>
          <CardDescription>
            This is how your name appears to your organizations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfile} className="space-y-4" noValidate>
            {profileError ? (
              <ErrorNotice error={new Error(profileError)} />
            ) : null}
            {updateProfile.isError ? (
              <ErrorNotice error={updateProfile.error} />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">First name</Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">Last name</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">
                {user?.email ?? '—'}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            Password
          </CardTitle>
          <CardDescription>
            Changing your password signs out your other sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePassword} className="space-y-4" noValidate>
            {passwordError ? (
              <ErrorNotice error={new Error(passwordError)} />
            ) : null}
            {changePassword.isError ? (
              <ErrorNotice error={changePassword.error} />
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Changing…' : 'Change password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Laptop className="size-4 text-muted-foreground" />
            Signed-in devices
          </CardTitle>
          <CardDescription>
            Revoke any session you no longer recognize.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : null}
          {sessions.isError ? (
            <ErrorNotice error={sessions.error} />
          ) : null}
          {revokeSession.isError ? (
            <ErrorNotice error={revokeSession.error} />
          ) : null}
          {sessions.data ? (
            <ul className="divide-y">
              {sessions.data.sessions.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">
                        {entry.userAgent ?? 'Unknown device'}
                      </span>
                      {entry.current ? (
                        <Badge variant="secondary">This device</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDateTime(entry.createdAt)}
                      {entry.lastUsedAt
                        ? ` · Last used ${formatDateTime(entry.lastUsedAt)}`
                        : ''}
                      {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                    </p>
                  </div>
                  {!entry.current ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokeSession.isPending}
                      onClick={() => revokeSession.mutate(entry.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

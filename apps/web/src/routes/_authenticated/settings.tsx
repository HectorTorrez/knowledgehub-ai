import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { KeyRound, Laptop, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '~/components/page-header';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
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
import { RouteError } from '~/components/route-states';
import { useToast } from '~/components/ui/toast';
import { useSession } from '~/hooks/use-auth';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { isApiError } from '~/lib/api/errors';
import { accountApi } from '~/lib/api/account';
import { SESSION_QUERY_KEY } from '~/lib/auth/session';
import { formatDateTime } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { changePasswordFormSchema, profileFormSchema } from '~/lib/validation';

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
  const router = useRouter();
  const { toast } = useToast();
  const reportError = useReportError();
  const session = useSession();
  const user =
    session.data?.status === 'authenticated' ? session.data.user : undefined;

  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [blocking, setBlocking] = useState<{ id: string; name: string }[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
  useQueryErrorToast(sessions.error, () => void sessions.refetch());

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
    onError: (error) => reportError(error),
  });

  const changePassword = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      accountApi.changePassword(input),
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
    onError: (error) => reportError(error),
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => accountApi.revokeSession(sessionId),
    onSuccess: () => {
      toast({ variant: 'success', title: 'Session signed out' });

      return sessions.refetch();
    },
    onError: (error) => reportError(error),
  });

  const downloadData = useMutation({
    mutationFn: () => accountApi.exportData(),
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `knowledgehub-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ variant: 'success', title: 'Your data was downloaded' });
    },
    onError: (error) => reportError(error),
  });

  const deleteAccount = useMutation({
    mutationFn: () => accountApi.deleteAccount(deletePassword),
    onSuccess: async () => {
      const navigation = router.navigate({ to: '/' });
      client.clear();
      client.setQueryData(SESSION_QUERY_KEY, { status: 'unauthenticated', redirectTo: '/' });
      await navigation;
      toast({ variant: 'success', title: 'Account deleted' });
    },
    onError: (error) => {
      if (
        isApiError(error) &&
        error.status === 409 &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'organizations' in error.cause &&
        Array.isArray(error.cause.organizations)
      ) {
        setBlocking(
          error.cause.organizations.filter(
            (item): item is { id: string; name: string } =>
              typeof item?.id === 'string' && typeof item?.name === 'string',
          ),
        );
        return;
      }
      reportError(error);
    },
  });

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = profileFormSchema.safeParse({ firstName, lastName });

    if (!result.success) {
      reportError(
        new Error(result.error.issues[0]?.message ?? 'Invalid profile.'),
      );
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

    const result = changePasswordFormSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!result.success) {
      reportError(
        new Error(result.error.issues[0]?.message ?? 'Invalid password.'),
      );
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
          {sessions.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {sessions.isError ? <RouteError title="Unable to load devices" onRetry={() => void sessions.refetch()} /> : null}
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
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Download a copy of your personal data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={downloadData.isPending}
            onClick={() => downloadData.mutate()}
          >
            Download my data
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Permanently delete your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete account</AlertDialogTitle>
                <AlertDialogDescription>
                  Your account and solo organizations will be permanently
                  deleted. You will be signed out on all devices.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-password">Password</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    Type DELETE to confirm
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </div>
                {blocking.length > 0 ? (
                  <div>
                    <p>Transfer ownership before deleting your account:</p>
                    <ul>
                      {blocking.map((org) => (
                        <li key={org.id}>
                          <Link
                            className="underline"
                            to="/organizations/$organizationId/settings"
                            params={{ organizationId: org.id }}
                          >
                            {org.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={
                    !deletePassword ||
                    confirmation !== 'DELETE' ||
                    deleteAccount.isPending
                  }
                  onClick={() => deleteAccount.mutate()}
                >
                  Delete account
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

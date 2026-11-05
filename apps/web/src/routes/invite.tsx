import type { InvitationPreviewResponse } from '@knowledgehub/shared-types';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  UserRoundPlus,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '~/components/auth-layout';
import { Brand } from '~/components/brand';
import { PasswordInput } from '~/components/password-input';
import { RouteError } from '~/components/route-states';
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
import {
  useAcceptInvitationWithNewAccount,
  useSession,
} from '~/hooks/use-auth';
import { useReportError } from '~/hooks/use-error-toast';
import { useRedirectSignedInVisitor } from '~/hooks/use-redirect-signed-in-visitor';
import { isConflict, isNotFound } from '~/lib/api/errors';
import { invitationsApi } from '~/lib/api/invitations';
import { queryKeys } from '~/lib/api/query-keys';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { cn } from '~/lib/utils';
import { inviteSignupFormSchema, PASSWORD_MIN_LENGTH } from '~/lib/validation';

export const Route = createFileRoute('/invite')({
  ssr: false,
  head: ({ match }) => ({
    meta: [
      {
        title: createTranslator(match.context.locale)(
          'invitations.signup.pageTitle',
        ),
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token
        : undefined,
  }),
  component: InvitePage,
});

function acceptPath(token: string): string {
  return `/invitations/accept?token=${encodeURIComponent(token)}`;
}

function InvitePage() {
  const { token } = Route.useSearch();
  useRedirectSignedInVisitor(token === undefined ? null : acceptPath(token));
  const session = useSession();
  const arrivedSignedOut = session.data?.status === 'unauthenticated';
  const preview = useQuery({
    queryKey: queryKeys.invitationPreview(token ?? ''),
    queryFn: () => invitationsApi.preview(token ?? ''),
    enabled: token !== undefined && arrivedSignedOut,
    retry: false,
  });

  return (
    <AuthLayout>
      <div className="flex justify-center lg:hidden">
        <Brand />
      </div>
      {token === undefined || isNotFound(preview.error) ? (
        <InvalidInvitation />
      ) : preview.isError ? (
        <RouteError onRetry={() => void preview.refetch()} />
      ) : preview.data === undefined ? (
        <LoadingInvitation />
      ) : preview.data.accountExists ? (
        <SignInToAccept token={token} invitation={preview.data} />
      ) : (
        <CreateAccountAndJoin
          token={token}
          invitation={preview.data}
          onAccountAlreadyExists={() => void preview.refetch()}
        />
      )}
    </AuthLayout>
  );
}

function CreateAccountAndJoin({
  token,
  invitation,
  onAccountAlreadyExists,
}: Readonly<{
  token: string;
  invitation: InvitationPreviewResponse;
  onAccountAlreadyExists: () => void;
}>) {
  const t = useT();
  const isHydrated = useHydrated();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportError = useReportError();
  const signup = useAcceptInvitationWithNewAccount();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    password: '',
  });
  const meetsMinimumLength = form.password.length >= PASSWORD_MIN_LENGTH;
  const organization = invitation.organizationName;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = inviteSignupFormSchema(t).safeParse(form);

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    let organizationId: string;
    try {
      ({ organizationId } = await signup.mutateAsync({
        ...result.data,
        token,
      }));
    } catch (error) {
      reportError(error);
      if (isConflict(error)) onAccountAlreadyExists();
      return;
    }

    toast({
      variant: 'success',
      title: t('invitations.signup.created'),
      description: t('invitations.signup.createdDescription', {
        organization,
      }),
    });
    await navigate({
      to: '/organizations/$organizationId',
      params: { organizationId },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t('invitations.signup.title', { organization })}
        </CardTitle>
        <CardDescription>
          {t('invitations.signup.description', {
            organization,
            role: t(`roles.${invitation.role}`),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          role="note"
          className="flex gap-3 rounded-md border border-info/30 bg-info/5 p-3 text-sm"
        >
          <UserRoundPlus className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <p className="font-medium">
              {t('invitations.signup.autoAccountTitle')}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t('invitations.signup.autoAccountDescription', {
                email: invitation.email,
                organization,
              })}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t('fields.email')}</Label>
            <Input
              id="email"
              type="email"
              value={invitation.email}
              readOnly
              aria-describedby="email-hint"
              className="bg-muted text-muted-foreground"
            />
            <p id="email-hint" className="text-xs text-muted-foreground">
              {t('invitations.signup.emailHint')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('fields.firstName')}</Label>
              <Input
                readOnly={!isHydrated}
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
                readOnly={!isHydrated}
                id="lastName"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(event) => update('lastName', event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              {t('invitations.signup.passwordLabel')}
            </Label>
            <PasswordInput
              readOnly={!isHydrated}
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
              {meetsMinimumLength ? <CircleCheck className="size-3.5" /> : null}
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
            disabled={!isHydrated || signup.isPending || signup.isSuccess}
          >
            {signup.isPending || signup.isSuccess
              ? t('invitations.signup.submitting')
              : t('invitations.signup.submit')}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          {t('invitations.signup.haveAccount')}{' '}
          <Link
            to="/login"
            search={{ redirect: acceptPath(token) }}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t('auth.login.submit')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

function SignInToAccept({
  token,
  invitation,
}: Readonly<{ token: string; invitation: InvitationPreviewResponse }>) {
  const t = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t('invitations.signup.existingTitle', {
            organization: invitation.organizationName,
          })}
        </CardTitle>
        <CardDescription>
          {t('invitations.signup.existingDescription', {
            email: invitation.email,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/login" search={{ redirect: acceptPath(token) }}>
            {t('invitations.signup.signIn')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function InvalidInvitation() {
  const t = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CircleAlert className="size-5 text-destructive" />
          {t('invitations.signup.invalidTitle')}
        </CardTitle>
        <CardDescription>
          {t('invitations.signup.invalidDescription')}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function LoadingInvitation() {
  const t = useT();

  return (
    <Card>
      <CardContent className="flex justify-center py-10">
        <LoaderCircle
          role="status"
          aria-label={t('states.loading')}
          className="size-6 animate-spin text-muted-foreground"
        />
      </CardContent>
    </Card>
  );
}

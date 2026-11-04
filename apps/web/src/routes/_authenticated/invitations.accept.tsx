import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Brand } from '~/components/brand';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { useToast } from '~/components/ui/toast';
import { useResendVerificationEmail, useSession } from '~/hooks/use-auth';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { invitationsApi } from '~/lib/api/invitations';
import { queryKeys } from '~/lib/api/query-keys';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/_authenticated/invitations/accept')({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('invitations.pageTitle'),
      description: t('invitations.pageDescription'),
      path: '/invitations/accept',
    });
  },
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token
        : undefined,
  }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const t = useT();
  const { token } = Route.useSearch();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportError = useReportError();
  const [accepted, setAccepted] = useState(false);
  const session = useSession();
  const user =
    session.data?.status === 'authenticated' ? session.data.user : undefined;
  const tokenError = useMemo(
    () =>
      token === undefined ? new Error(t('invitations.missingToken')) : null,
    [token, t],
  );
  useQueryErrorToast(tokenError);

  const accept = useMutation({
    mutationFn: (invitationToken: string) =>
      invitationsApi.accept(invitationToken),
    onSuccess: async () => {
      setAccepted(true);
      toast({
        variant: 'success',
        title: t('invitations.accepted'),
        description: t('invitations.acceptedDescription'),
      });
      await client.invalidateQueries({
        queryKey: queryKeys.organizations.all,
      });
    },
    onError: (error) => reportError(error),
  });

  async function handleAccept() {
    if (token === undefined) {
      return;
    }

    try {
      const result = await accept.mutateAsync(token);
      await navigate({
        to: '/organizations/$organizationId',
        params: { organizationId: result.organizationId },
      });
    } catch {
      return;
    }
  }

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-6">
      <div className="flex justify-center">
        <Brand />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-muted-foreground" />
            {t('invitations.title')}
          </CardTitle>
          <CardDescription>
            {accepted ? t('invitations.opening') : t('invitations.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user !== undefined && !user.emailVerified ? (
            <VerifyEmailFirst email={user.email} />
          ) : accepted ? null : (
            <Button
              className="w-full"
              disabled={token === undefined || accept.isPending}
              onClick={() => void handleAccept()}
            >
              {accept.isPending
                ? t('invitations.accepting')
                : t('invitations.accept')}
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {t('invitations.expiry')}
      </p>
    </div>
  );
}

function VerifyEmailFirst({ email }: Readonly<{ email: string }>) {
  const t = useT();
  const resend = useResendVerificationEmail(email);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        <p className="font-medium">{t('invitations.verifyFirst')}</p>
        <p className="mt-1 text-muted-foreground">
          {t('invitations.verifyFirstDescription', { email })}
        </p>
      </div>
      <Button
        className="w-full"
        variant="outline"
        disabled={resend.isPending || resend.isSuccess}
        onClick={() => resend.mutate()}
      >
        {resend.isPending ? t('emailBanner.sending') : t('emailBanner.resend')}
      </Button>
    </div>
  );
}

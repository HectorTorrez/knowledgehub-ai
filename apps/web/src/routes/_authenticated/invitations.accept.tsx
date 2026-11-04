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
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { invitationsApi } from '~/lib/api/invitations';
import { queryKeys } from '~/lib/api/query-keys';
import { useT } from '~/lib/i18n/provider';
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
          {accepted ? null : (
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

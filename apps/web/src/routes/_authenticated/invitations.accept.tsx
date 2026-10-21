import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Mail } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '~/components/brand';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useToast } from '~/components/ui/toast';
import { invitationsApi } from '~/lib/api/invitations';
import { queryKeys } from '~/lib/api/query-keys';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/_authenticated/invitations/accept')({
  head: () =>
    pageHead({
      title: 'Accept invitation · KnowledgeHub AI',
      description: 'Join an organization on KnowledgeHub AI.',
      path: '/invitations/accept',
    }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token
        : undefined,
  }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { token } = Route.useSearch();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(false);

  const accept = useMutation({
    mutationFn: (invitationToken: string) =>
      invitationsApi.accept(invitationToken),
    onSuccess: async () => {
      setAccepted(true);
      toast({
        variant: 'success',
        title: 'Invitation accepted',
        description: 'You now have access to this organization.',
      });
      await client.invalidateQueries({
        queryKey: queryKeys.organizations.all,
      });
    },
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
            Organization invitation
          </CardTitle>
          <CardDescription>
            {accepted
              ? 'Opening the organization…'
              : 'Accept this invitation to join the organization and access its documents.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {token === undefined ? (
            <ErrorNotice error={new Error('This invitation link is missing its token. Ask an organization owner for a new link.')} />
          ) : null}

          {accept.isError ? <ErrorNotice error={accept.error} /> : null}

          {accepted ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Invitation accepted.
            </p>
          ) : (
            <Button
              className="w-full"
              disabled={token === undefined || accept.isPending}
              onClick={() => void handleAccept()}
            >
              {accept.isPending ? 'Accepting…' : 'Accept invitation'}
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Invitations expire and can only be used once.
      </p>
    </div>
  );
}

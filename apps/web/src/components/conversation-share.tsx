import type { ConversationSummary } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { useToast } from '~/components/ui/toast';
import { useSession } from '~/hooks/use-auth';
import { conversationsApi } from '~/lib/api/conversations';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';

export function ConversationShare({
  organizationId,
  conversation,
}: Readonly<{
  organizationId: string;
  conversation: ConversationSummary;
}>) {
  const client = useQueryClient();
  const { toast } = useToast();
  const session = useSession();
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const mutation = useMutation({
    mutationFn: (visibility: 'PRIVATE' | 'ORGANIZATION') =>
      conversationsApi.update(organizationId, conversation.id, { visibility }),
    onSuccess: (data) => {
      client.setQueryData(
        queryKeys.organizations.conversations.detail(
          organizationId,
          conversation.id,
        ),
        data,
      );
    },
    onError: () =>
      toast({ variant: 'error', title: 'Could not update sharing' }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.conversations.all(organizationId),
      }),
  });
  const shared =
    (mutation.isPending ? mutation.variables : conversation.visibility) ===
    'ORGANIZATION';
  const viewerId =
    session.data?.status === 'authenticated' ? session.data.user.id : undefined;
  const creator = conversation.createdBy;

  async function copyLink() {
    const url = new URL(
      `/organizations/${encodeURIComponent(organizationId)}/ask`,
      window.location.origin,
    );
    url.searchParams.set('conversation', conversation.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast({ variant: 'success', title: 'Link copied' });
    } catch {
      toast({ variant: 'error', title: 'Could not copy link' });
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          {shared ? 'Shared' : 'Share'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(18rem,calc(100vw-2rem))] space-y-4 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="share-organization" className="text-sm font-medium">
            Share with organization
          </label>
          <Switch
            id="share-organization"
            checked={shared}
            disabled={!conversation.canShare || mutation.isPending}
            onCheckedChange={(checked) =>
              mutation.mutate(checked ? 'ORGANIZATION' : 'PRIVATE')
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Only members of{' '}
          {organization.data?.organization.name ?? 'this organization'} can open
          this link.
        </p>
        {creator && viewerId && creator.id !== viewerId ? (
          <p className="text-xs text-muted-foreground">
            Shared by {creator.firstName} {creator.lastName}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void copyLink()}
        >
          Copy link
        </Button>
      </PopoverContent>
    </Popover>
  );
}

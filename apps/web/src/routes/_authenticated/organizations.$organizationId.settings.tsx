import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { History, LogOut, Settings, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { activityApi } from '~/lib/api/activity';
import { formatActivity } from '~/lib/activity-format';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime, formatRole } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { organizationNameSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/settings',
)({
  head: () =>
    pageHead({
      title: 'Settings · KnowledgeHub AI',
      description: 'Rename, leave, or delete this organization.',
    }),
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });

  const isOwner = organization.data?.organization.role === 'OWNER';
  const activity = useInfiniteQuery({
    queryKey: ['organizations', organizationId, 'activity'],
    queryFn: ({ pageParam }) => activityApi.list(organizationId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: isOwner,
  });
  const currentName = organization.data?.organization.name ?? '';
  const nameDraft = name ?? currentName;
  const dirty = name !== null && name !== currentName;

  const rename = useMutation({
    mutationFn: (nextName: string) =>
      organizationsApi.updateName(organizationId, { name: nextName }),
    onSuccess: async (data) => {
      toast({
        variant: 'success',
        title: 'Organization renamed',
        description: `It is now “${data.organization.name}”.`,
      });
      setName(null);
      await Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.detail(organizationId),
        }),
        client.invalidateQueries({ queryKey: queryKeys.organizations.list() }),
      ]);
    },
  });

  const leave = useMutation({
    mutationFn: () => organizationsApi.leave(organizationId),
    onSuccess: async () => {
      toast({ variant: 'success', title: 'You left the organization' });
      await client.invalidateQueries({ queryKey: queryKeys.organizations.all });
      await navigate({ to: '/organizations' });
    },
  });

  const remove = useMutation({
    mutationFn: () => organizationsApi.remove(organizationId),
    onSuccess: async () => {
      toast({
        variant: 'success',
        title: 'Organization deleted',
        description: 'Its documents, answers, and memberships were removed.',
      });
      await client.invalidateQueries({ queryKey: queryKeys.organizations.all });
      await navigate({ to: '/organizations' });
    },
  });

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = organizationNameSchema.safeParse({ name: nameDraft });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid name.');
      return;
    }

    try {
      await rename.mutateAsync(result.data.name);
    } catch {
      return;
    }
  }

  if (organization.isPending) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (organization.isError) {
    return (
      <ErrorNotice
        error={organization.error}
        onRetry={() => void organization.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage this organization’s name and your membership."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-4 text-muted-foreground" />
            Organization details
          </CardTitle>
          <CardDescription>
            {isOwner
              ? 'Owners can rename the organization.'
              : `Only owners can rename the organization. Your role is ${formatRole(
                  organization.data.organization.role,
                )}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOwner ? (
            <form
              onSubmit={handleRename}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
            >
              {validationError ? (
                <div className="w-full">
                  <ErrorNotice error={new Error(validationError)} />
                </div>
              ) : null}
              {rename.isError ? (
                <div className="w-full">
                  <ErrorNotice error={rename.error} />
                </div>
              ) : null}
              <div className="flex-1 space-y-2">
                <Label htmlFor="organization-name-setting">Name</Label>
                <Input
                  id="organization-name-setting"
                  value={nameDraft}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={!dirty || rename.isPending || nameDraft.trim().length === 0}
              >
                {rename.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          ) : (
            <p className="text-sm">{organization.data.organization.name}</p>
          )}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader><CardTitle>Activity</CardTitle><CardDescription>Recent organization activity.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {activity.isPending ? <Skeleton className="h-24 w-full" /> : activity.isError && !activity.data ? (
              <ErrorNotice error={activity.error} onRetry={() => void activity.refetch()} />
            ) : activity.data?.pages.every((page) => page.activities.length === 0) ? (
              <EmptyState icon={History} title="No activity yet" />
            ) : (
              <ul className="space-y-4">
                {activity.data?.pages.flatMap((page) => page.activities).map((item) => (
                  <li key={item.id} className="text-sm"><p>{formatActivity(item)}</p><p className="text-muted-foreground">{formatDateTime(item.createdAt)}</p></li>
                ))}
              </ul>
            )}
            {activity.isFetchNextPageError ? <ErrorNotice error={activity.error} onRetry={() => void activity.fetchNextPage()} /> : null}
            {activity.hasNextPage ? <Button variant="outline" disabled={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>{activity.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            These actions affect your access immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Leave this organization</p>
            <p className="text-sm text-muted-foreground">
              {isOwner
                ? 'If you are the last owner, transfer ownership or delete the organization instead.'
                : 'You will lose access to its documents and answers.'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut />
            Leave
          </Button>
        </CardContent>

        {isOwner ? (
          <CardContent className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Delete this organization</p>
              <p className="text-sm text-muted-foreground">
                Permanently removes its documents, answers, and memberships.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              Delete
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave organization</DialogTitle>
            <DialogDescription>
              You will lose access to “{organization.data.organization.name}”
              and everything in it. You can rejoin only with a new invitation.
            </DialogDescription>
          </DialogHeader>
          {leave.isError ? <ErrorNotice error={leave.error} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={leave.isPending}
              onClick={() => void leave.mutateAsync()}
            >
              {leave.isPending ? 'Leaving…' : 'Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete organization</DialogTitle>
            <DialogDescription>
              This permanently deletes “{organization.data.organization.name}”,
              including every document, answer, and membership. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError ? <ErrorNotice error={remove.error} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void remove.mutateAsync()}
            >
              {remove.isPending ? 'Deleting…' : 'Delete organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

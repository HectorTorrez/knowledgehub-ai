import { FREE_PLAN } from '~/lib/plans';
import { usageProgress } from '~/lib/usage';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { History, LogOut, Settings, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { PageHeader } from '~/components/page-header';
import { Button, buttonVariants } from '~/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import {
  useQueryErrorToast,
  useReportError,
} from '~/hooks/use-error-toast';
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
  const reportError = useReportError();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  useQueryErrorToast(organization.error, () => void organization.refetch());

  const canDeleteOrganization = organization.data?.organization.capabilities.includes('organization.delete') ?? false;
  const canManage = organization.data?.organization.capabilities.includes('organization.manage') ?? false;
  const usage = useQuery({
    queryKey: ['organizations', organizationId, 'usage'],
    queryFn: () => organizationsApi.usage(organizationId),
    enabled: canManage,
  });
  useQueryErrorToast(usage.error, () => void usage.refetch());
  const activity = useInfiniteQuery({
    queryKey: ['organizations', organizationId, 'activity'],
    queryFn: ({ pageParam }) => activityApi.list(organizationId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: canManage,
  });
  useQueryErrorToast(activity.error, () => void activity.refetch());
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
    onError: (error) => reportError(error),
  });

  const leave = useMutation({
    mutationFn: () => organizationsApi.leave(organizationId),
    onSuccess: async () => {
      toast({ variant: 'success', title: 'You left the organization' });
      await client.invalidateQueries({ queryKey: queryKeys.organizations.all });
      await navigate({ to: '/organizations' });
    },
    onError: (error) => reportError(error),
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
    onError: (error) => reportError(error),
  });

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = organizationNameSchema.safeParse({ name: nameDraft });

    if (!result.success) {
      reportError(
        new Error(result.error.issues[0]?.message ?? 'Invalid name.'),
      );
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
    return null;
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
            {canManage
              ? 'Owners and admins can rename the organization.'
              : `Only owners and admins can rename the organization. Your role is ${formatRole(
                  organization.data.organization.role,
                )}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <form
              onSubmit={handleRename}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
            >
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

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Usage &amp; plan</CardTitle>
            <CardDescription>Current plan: {FREE_PLAN.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.data ? (
              <div className="space-y-4">
                {([
                  ['Daily answers', usage.data.usage.answers],
                  ['Documents', usage.data.usage.documents],
                  ['Storage (bytes)', usage.data.usage.storageBytes],
                  ['Members', usage.data.usage.members],
                ] as const).map(([label, counter]) => {
                  const progress = usageProgress(counter.used, counter.limit);
                  return (
                    <div key={label} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
                        <span>{counter.used.toLocaleString()} / {counter.limit?.toLocaleString() ?? 'Unlimited'}</span>
                      </div>
                      <Progress
                        aria-label={label}
                        value={progress.value}
                        indicatorClassName={progress.tone === 'destructive' ? 'bg-destructive' : progress.tone === 'warning' ? 'bg-amber-500' : undefined}
                      />
                    </div>
                  );
                })}
                <p className="text-sm text-muted-foreground">Daily answers reset {formatDateTime(usage.data.usage.answers.resetsAt)}</p>
              </div>
            ) : usage.isPending ? <Skeleton className="h-16 w-full" /> : null}
            <Button asChild variant="outline">
              <a href="/#pricing">Upgrade</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader><CardTitle>Activity</CardTitle><CardDescription>Recent organization activity.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {activity.isPending ? <Skeleton className="h-24 w-full" /> : activity.data?.pages.every((page) => page.activities.length === 0) ? (
              <EmptyState icon={History} title="No activity yet" />
            ) : (
              <ul className="space-y-4">
                {activity.data?.pages.flatMap((page) => page.activities).map((item) => (
                  <li key={item.id} className="text-sm"><p>{formatActivity(item)}</p><p className="text-muted-foreground">{formatDateTime(item.createdAt)}</p></li>
                ))}
              </ul>
            )}
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
              {canDeleteOrganization
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

        {canDeleteOrganization ? (
          <CardContent className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between sm:pt-6">
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

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave organization</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to “{organization.data.organization.name}”
              and everything in it. You can rejoin only with a new invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={leave.isPending}
              onClick={(event) => {
                event.preventDefault();
                void leave.mutateAsync();
              }}
            >
              {leave.isPending ? 'Leaving…' : 'Leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{organization.data.organization.name}”,
              including every document, answer, and membership. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void remove.mutateAsync();
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete organization'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

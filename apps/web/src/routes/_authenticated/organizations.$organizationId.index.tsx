import type {
  OrganizationInvitationDetail,
  OrganizationRole,
} from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '~/components/empty-state';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { useSession } from '~/hooks/use-auth';
import { invitationsApi } from '~/lib/api/invitations';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { isNotFound } from '~/lib/api/errors';
import { cn } from '~/lib/utils';
import { formatDate, formatDateTime, formatRole } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { memberEmailSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/',
)({
  head: () =>
    pageHead({
      title: 'Overview · KnowledgeHub AI',
      description:
        'Manage the members and roles with access to this organization.',
    }),
  component: OrganizationOverviewPage,
});

interface MemberToRemove {
  userId: string;
  name: string;
}

function OrganizationOverviewPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [inviteResult, setInviteResult] =
    useState<OrganizationInvitationDetail | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberToRemove | null>(null);

  const currentUserId =
    session.data?.status === 'authenticated' ? session.data.user.id : undefined;

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
  });

  const isOwner = organization.data?.organization.role === 'OWNER';

  const usage = useQuery({
    queryKey: queryKeys.organizations.usage(organizationId),
    queryFn: () => organizationsApi.usage(organizationId),
  });

  const invitations = useQuery({
    queryKey: queryKeys.organizations.invitations.list(organizationId),
    queryFn: () => invitationsApi.list(organizationId),
    enabled: isOwner,
  });

  const addMember = useMutation({
    mutationFn: (input: { organizationId: string; email: string }) =>
      organizationsApi.addMember(input.organizationId, { email: input.email }),
    onSuccess: (data, variables) => {
      toast({
        variant: 'success',
        title: 'Member added',
        description: `${data.member.email} can now access this organization.`,
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: {
      organizationId: string;
      userId: string;
      role: OrganizationRole;
    }) =>
      organizationsApi.updateMemberRole(input.organizationId, input.userId, {
        role: input.role,
      }),
    onSuccess: (data, variables) => {
      toast({
        variant: 'success',
        title: 'Role updated',
        description: `${data.member.email} is now ${
          data.member.role === 'OWNER' ? 'an owner' : 'a member'
        }.`,
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
  });

  const createInvitation = useMutation({
    mutationFn: (input: { organizationId: string; email: string }) =>
      invitationsApi.create(input.organizationId, { email: input.email }),
    onSuccess: (data, variables) => {
      setInviteResult(data.invitation);
      setEmail('');

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.invitations.list(
          variables.organizationId,
        ),
      });
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: (input: { organizationId: string; invitationId: string }) =>
      invitationsApi.revoke(input.organizationId, input.invitationId),
    onSuccess: (_data, variables) => {
      toast({ variant: 'success', title: 'Invitation revoked' });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.invitations.list(
          variables.organizationId,
        ),
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: (input: { organizationId: string; userId: string }) =>
      organizationsApi.removeMember(input.organizationId, input.userId),
    onSuccess: (_data, variables) => {
      toast({ variant: 'success', title: 'Member removed' });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
  });

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const result = memberEmailSchema.safeParse({ email });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid email.');
      return;
    }

    try {
      await addMember.mutateAsync({ organizationId, email: result.data.email });
      setEmail('');
      setAddMemberOpen(false);
    } catch (error) {
      if (!isNotFound(error)) {
        return;
      }

      addMember.reset();

      try {
        await createInvitation.mutateAsync({
          organizationId,
          email: result.data.email,
        });
      } catch {
        return;
      }
    }
  }

  function handleAddMemberOpenChange(open: boolean) {
    setAddMemberOpen(open);

    if (!open) {
      setEmail('');
      setValidationError(null);
      setInviteResult(null);
      addMember.reset();
      createInvitation.reset();
    }
  }

  async function copyInviteLink() {
    if (inviteResult === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink(inviteResult.token));
      toast({ variant: 'success', title: 'Invitation link copied' });
    } catch {
      toast({
        variant: 'error',
        title: 'Could not copy the link',
        description: 'Select the link and copy it manually.',
      });
    }
  }

  async function handleRemoveMember(member: MemberToRemove) {
    try {
      await removeMember.mutateAsync({ organizationId, userId: member.userId });
      setMemberToRemove(null);
    } catch {
      return;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={organization.data?.organization.name ?? 'Organization'}
        description="Manage members, invitations, and daily answer usage for this organization."
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Summary of this organization.</CardDescription>
          {organization.isError ? (
            <ErrorNotice
              error={organization.error}
              onRetry={() => void organization.refetch()}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Name">
              {organization.data?.organization.name ?? '—'}
            </DetailItem>
            <DetailItem label="Your role">
              {organization.data
                ? formatRole(organization.data.organization.role)
                : '—'}
            </DetailItem>
            <DetailItem label="Members">
              {members.data?.members.length ?? '—'}
            </DetailItem>
            <DetailItem label="Created">
              {organization.data
                ? formatDate(organization.data.organization.createdAt)
                : '—'}
            </DetailItem>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily answer usage</CardTitle>
          <CardDescription>
            Answers reset at midnight UTC. The limit is shared by everyone in
            this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : null}
          {usage.isError ? (
            <ErrorNotice
              error={usage.error}
              onRetry={() => void usage.refetch()}
            />
          ) : null}
          {usage.data ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {usage.data.usage.answers.used} of{' '}
                  {usage.data.usage.answers.limit} answers
                </span>
                <span className="text-muted-foreground">
                  Resets {formatDateTime(usage.data.usage.answers.resetsAt)}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={usage.data.usage.answers.limit}
                aria-valuenow={usage.data.usage.answers.used}
                aria-label="Daily answer usage"
              >
                <div
                  className={cn(
                    'h-full transition-[width]',
                    usage.data.usage.answers.used >=
                      usage.data.usage.answers.limit
                      ? 'bg-destructive'
                      : 'bg-primary',
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (usage.data.usage.answers.used /
                          usage.data.usage.answers.limit) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={addMemberOpen} onOpenChange={handleAddMemberOpenChange}>
        <Card>
          <div className="flex flex-col items-start gap-3 p-4 pb-0 sm:flex-row sm:p-6 sm:pb-0 sm:items-start sm:justify-between sm:gap-4">
            <div className="space-y-1.5">
              <h2 className="font-semibold leading-none tracking-tight">Members</h2>
              <p className="text-sm text-muted-foreground">
                People who can access this organization. If someone has no
                account yet, adding them creates a shareable invitation.
              </p>
            </div>
            {isOwner ? (
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserPlus />
                  Add member
                </Button>
              </DialogTrigger>
            ) : null}
          </div>

          <CardContent className="p-4 sm:p-6">
            {members.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : null}

            {members.isError ? (

              <ErrorNotice

                error={members.error}

                onRetry={() => void members.refetch()}

              />

            ) : null}

            {members.data && members.data.members.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No members yet"
                description="Members can upload documents and ask questions."
              />
            ) : null}

            {members.data && members.data.members.length > 0 ? (
              <ul className="divide-y">
                {members.data.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {initialsFor(member.firstName, member.lastName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.firstName} {member.lastName}
                          {member.userId === currentUserId ? (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                      {isOwner && member.userId !== currentUserId ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRole.mutate({
                              organizationId,
                              userId: member.userId,
                              role: role as OrganizationRole,
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-28"
                            aria-label={`Role for ${member.email}`}
                            disabled={updateRole.isPending}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OWNER">Owner</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">
                          {formatRole(member.role)}
                        </Badge>
                      )}
                      {isOwner && member.userId !== currentUserId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${member.email}`}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            setMemberToRemove({
                              userId: member.userId,
                              name: `${member.firstName} ${member.lastName}`.trim() ||
                                member.email,
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {updateRole.isError ? <ErrorNotice error={updateRole.error} /> : null}
            {removeMember.isError ? (
              <ErrorNotice error={removeMember.error} />
            ) : null}
          </CardContent>
        </Card>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>
              If the person already has an account, they join immediately as a
              MEMBER. Otherwise we create an invitation you can share.
            </DialogDescription>
          </DialogHeader>

          {inviteResult !== null ? (
            <div className="space-y-4">
              <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm">
                <p className="font-medium">
                  Invitation ready for {inviteResult.email}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Share this one-time link. It expires on{' '}
                  {formatDateTime(inviteResult.expiresAt)}.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-link">Invitation link</Label>
                <div className="flex gap-2">
                  <Input
                    id="invite-link"
                    readOnly
                    value={inviteLink(inviteResult.token)}
                    onFocus={(event) => event.target.select()}
                  />
                  <Button type="button" variant="outline" onClick={() => void copyInviteLink()}>
                    <Copy />
                    Copy
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleAddMember} className="space-y-4" noValidate>
              {validationError ? (
                <ErrorNotice error={new Error(validationError)} />
              ) : null}
              {addMember.isError && !isNotFound(addMember.error) ? (
                <ErrorNotice error={addMember.error} />
              ) : null}
              {createInvitation.isError ? (
                <ErrorNotice error={createInvitation.error} />
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  autoFocus
                  placeholder="teammate@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addMember.isPending || createInvitation.isPending}
                >
                  {addMember.isPending || createInvitation.isPending
                    ? 'Adding…'
                    : 'Add or invite'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              Pending invitations
            </CardTitle>
            <CardDescription>
              Invitations that have not been accepted yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : null}

            {invitations.isError ? (
              <ErrorNotice
                error={invitations.error}
                onRetry={() => void invitations.refetch()}
              />
            ) : null}

            {invitations.data && invitations.data.invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending invitations. Add an email above to create one.
              </p>
            ) : null}

            {invitations.data && invitations.data.invitations.length > 0 ? (
              <ul className="divide-y">
                {invitations.data.invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {invitation.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expires {formatDateTime(invitation.expiresAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={
                        revokeInvitation.isPending &&
                        revokeInvitation.variables?.invitationId ===
                          invitation.id
                      }
                      onClick={() =>
                        revokeInvitation.mutate({
                          organizationId,
                          invitationId: invitation.id,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {revokeInvitation.isError ? (
              <ErrorNotice error={revokeInvitation.error} />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              {memberToRemove
                ? `${memberToRemove.name} will lose access to this organization.`
                : 'This member will lose access to this organization.'}
            </DialogDescription>
          </DialogHeader>
          {removeMember.isError ? (
            <ErrorNotice error={removeMember.error} />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={() => {
                if (memberToRemove) {
                  void handleRemoveMember(memberToRemove);
                }
              }}
            >
              {removeMember.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function inviteLink(token: string): string {
  return `${window.location.origin}/invitations/accept?token=${encodeURIComponent(token)}`;
}

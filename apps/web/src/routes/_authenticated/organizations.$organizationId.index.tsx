import type { OrganizationRole } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '~/components/empty-state';
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
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDate, formatRole } from '~/lib/format';
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
    } catch {
      return;
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
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Summary of this organization.</CardDescription>
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

      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <Card>
          <div className="flex items-start justify-between gap-4 p-6 pb-0">
            <div className="space-y-1.5">
              <h2 className="font-semibold leading-none tracking-tight">Members</h2>
              <p className="text-sm text-muted-foreground">
                People who can access this organization.
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

          <CardContent className="p-6">
            {members.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : null}

            {members.isError ? <ErrorNotice error={members.error} /> : null}

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
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {initialsFor(member.firstName, member.lastName)}
                      </span>
                      <div className="min-w-0">
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
                    <div className="flex shrink-0 items-center gap-2">
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
              The person must already have a KnowledgeHub AI account. They join
              as a MEMBER.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4" noValidate>
            {validationError ? (
              <ErrorNotice error={new Error(validationError)} />
            ) : null}
            {addMember.isError ? <ErrorNotice error={addMember.error} /> : null}
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
                onClick={() => setAddMemberOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMember.isPending}>
                {addMember.isPending ? 'Adding…' : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

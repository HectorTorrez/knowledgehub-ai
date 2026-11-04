import type {
  OrganizationInvitationDetail,
  OrganizationRole,
} from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { Badge } from '~/components/ui/badge';
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
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { invitationsApi } from '~/lib/api/invitations';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { isNotFound } from '~/lib/api/errors';
import { formatDateTime, formatRole } from '~/lib/format';
import { initials } from '~/lib/initials';
import { needsRoleChangeConfirmation } from '~/lib/role-change';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { memberEmailSchema } from '~/lib/validation';

interface MemberTarget {
  userId: string;
  name: string;
}

interface RoleChange extends MemberTarget {
  from: OrganizationRole;
  to: OrganizationRole;
}

interface InvitationToRevoke {
  id: string;
  email: string;
}

export function OrganizationMembers({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const { toast } = useToast();
  const reportError = useReportError();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('MEMBER');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [inviteResult, setInviteResult] =
    useState<OrganizationInvitationDetail | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberTarget | null>(
    null,
  );
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] =
    useState<InvitationToRevoke | null>(null);

  const currentUserId =
    session.data?.status === 'authenticated' ? session.data.user.id : undefined;

  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const capabilities = organization.data?.organization.capabilities ?? [];
  const canManageMembers = capabilities.includes('members.manage');
  const canManageOwners = capabilities.includes('owners.manage');

  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
  });
  const invitations = useQuery({
    queryKey: queryKeys.organizations.invitations.list(organizationId),
    queryFn: () => invitationsApi.list(organizationId),
    enabled: canManageMembers,
  });
  useQueryErrorToast(members.error, () => void members.refetch());
  useQueryErrorToast(invitations.error, () => void invitations.refetch());

  function invalidateMembers() {
    return client.invalidateQueries({
      queryKey: queryKeys.organizations.members(organizationId),
    });
  }

  function invalidateInvitations() {
    return client.invalidateQueries({
      queryKey: queryKeys.organizations.invitations.list(organizationId),
    });
  }

  const addMember = useMutation({
    mutationFn: (input: { email: string }) =>
      organizationsApi.addMember(organizationId, { email: input.email }),
    onSuccess: (data) => {
      toast({
        variant: 'success',
        title: t('members.memberAdded'),
        description: t('members.memberAddedDescription', {
          email: data.member.email,
        }),
      });
      return invalidateMembers();
    },
    onError: (error) => {
      if (!isNotFound(error)) {
        reportError(error);
      }
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: { userId: string; role: OrganizationRole }) =>
      organizationsApi.updateMemberRole(organizationId, input.userId, {
        role: input.role,
      }),
    onSuccess: (data) => {
      toast({
        variant: 'success',
        title: t('members.roleUpdated'),
        description: t('members.roleUpdatedDescription', {
          email: data.member.email,
          role: formatRole(data.member.role, t),
        }),
      });
      return invalidateMembers();
    },
    onError: (error) => reportError(error),
  });

  const createInvitation = useMutation({
    mutationFn: (input: { email: string; role: OrganizationRole }) =>
      invitationsApi.create(organizationId, input),
    onSuccess: (data) => {
      setInviteResult(data.invitation);
      setEmail('');
      toast({
        variant: 'success',
        title: t('members.invitationCreated'),
        description: t('members.invitationCreatedDescription', {
          email: data.invitation.email,
        }),
      });
      return invalidateInvitations();
    },
    onError: (error) => reportError(error),
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) =>
      invitationsApi.revoke(organizationId, invitationId),
    onSuccess: () => {
      toast({ variant: 'success', title: t('members.invitationRevoked') });
      return invalidateInvitations();
    },
    onError: (error) => reportError(error),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      organizationsApi.removeMember(organizationId, userId),
    onSuccess: () => {
      toast({ variant: 'success', title: t('members.memberRemoved') });
      return invalidateMembers();
    },
    onError: (error) => reportError(error),
  });

  const submitting = addMember.isPending || createInvitation.isPending;

  async function inviteByEmail(address: string) {
    try {
      await createInvitation.mutateAsync({ email: address, role: inviteRole });
    } catch {
      return;
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = memberEmailSchema(t).safeParse({ email });
    if (!result.success) {
      setEmailError(
        result.error.issues[0]?.message ?? t('validation.invalidInput'),
      );
      return;
    }
    setEmailError(null);

    if (inviteRole !== 'MEMBER') {
      await inviteByEmail(result.data.email);
      return;
    }

    try {
      await addMember.mutateAsync({ email: result.data.email });
      handleAddMemberOpenChange(false);
    } catch (error) {
      if (!isNotFound(error)) {
        return;
      }
      addMember.reset();
      await inviteByEmail(result.data.email);
    }
  }

  function handleAddMemberOpenChange(open: boolean) {
    setAddMemberOpen(open);

    if (!open) {
      setEmail('');
      setEmailError(null);
      setInviteRole('MEMBER');
      setInviteResult(null);
      addMember.reset();
      createInvitation.reset();
    }
  }

  function requestRoleChange(change: RoleChange) {
    if (needsRoleChangeConfirmation(change.from, change.to)) {
      setRoleChange(change);
      return;
    }
    updateRole.mutate({ userId: change.userId, role: change.to });
  }

  async function confirmRoleChange(change: RoleChange) {
    try {
      await updateRole.mutateAsync({ userId: change.userId, role: change.to });
      setRoleChange(null);
    } catch {
      return;
    }
  }

  async function confirmRevoke(invitation: InvitationToRevoke) {
    try {
      await revokeInvitation.mutateAsync(invitation.id);
      setInvitationToRevoke(null);
    } catch {
      return;
    }
  }

  async function confirmRemove(member: MemberTarget) {
    try {
      await removeMember.mutateAsync(member.userId);
      setMemberToRemove(null);
    } catch {
      return;
    }
  }

  async function copyInviteLink(invitation: OrganizationInvitationDetail) {
    try {
      await navigator.clipboard.writeText(inviteLink(invitation.token));
      toast({ variant: 'success', title: t('members.linkCopied') });
    } catch {
      toast({
        variant: 'error',
        title: t('members.copyFailed'),
        description: t('members.copyFailedDescription'),
      });
    }
  }

  return (
    <>
      <Dialog open={addMemberOpen} onOpenChange={handleAddMemberOpenChange}>
        <Card>
          <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
            <div className="space-y-1.5">
              <CardTitle>
                <h2>{t('members.membersTitle')}</h2>
              </CardTitle>
              <CardDescription>
                {t('members.membersDescription')}
              </CardDescription>
            </div>
            {canManageMembers ? (
              <DialogTrigger asChild>
                <Button size="sm" className="min-h-11 sm:min-h-0">
                  <UserPlus />
                  {t('members.addMember')}
                </Button>
              </DialogTrigger>
            ) : null}
          </CardHeader>

          <CardContent>
            {members.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : null}

            {members.isError ? (
              <RouteError
                title={t('members.membersLoadError')}
                onRetry={() => void members.refetch()}
              />
            ) : null}

            {members.data && members.data.members.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title={t('members.noMembers')}
                description={t('members.noMembersDescription')}
              />
            ) : null}

            {members.data && members.data.members.length > 0 ? (
              <ul className="divide-y">
                {members.data.members.map((member) => {
                  const name =
                    `${member.firstName} ${member.lastName}`.trim() ||
                    member.email;
                  const manageable =
                    canManageMembers &&
                    (member.role !== 'OWNER' || canManageOwners) &&
                    member.userId !== currentUserId;
                  const rowPending =
                    updateRole.isPending &&
                    updateRole.variables?.userId === member.userId;

                  return (
                    <li
                      key={member.userId}
                      className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                        >
                          {initials(member.firstName, member.lastName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {member.firstName} {member.lastName}
                            {member.userId === currentUserId ? (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                {t('members.you')}
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        {manageable ? (
                          <Select
                            value={member.role}
                            onValueChange={(role) =>
                              requestRoleChange({
                                userId: member.userId,
                                name,
                                from: member.role,
                                to: role as OrganizationRole,
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={t('members.roleFor', {
                                email: member.email,
                              })}
                              aria-busy={rowPending}
                              disabled={rowPending}
                            >
                              <SelectValue>
                                {formatRole(member.role, t)}
                              </SelectValue>
                            </SelectTrigger>
                            <RoleOptions canManageOwners={canManageOwners} />
                          </Select>
                        ) : (
                          <Badge variant="secondary">
                            {formatRole(member.role, t)}
                          </Badge>
                        )}
                        {manageable ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('members.removeMemberLabel', {
                              email: member.email,
                            })}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setMemberToRemove({ userId: member.userId, name })
                            }
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('members.addMemberTitle')}</DialogTitle>
            <DialogDescription>
              {t('members.addMemberDescription')}
            </DialogDescription>
          </DialogHeader>

          {inviteResult !== null ? (
            <div className="space-y-4">
              <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm">
                <p className="font-medium">
                  {t('members.inviteReady', { email: inviteResult.email })}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t('members.inviteExpires', {
                    date: formatDateTime(inviteResult.expiresAt, locale),
                  })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-link">
                  {t('members.invitationLink')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="invite-link"
                    readOnly
                    value={inviteLink(inviteResult.token)}
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyInviteLink(inviteResult)}
                  >
                    <Copy />
                    {t('members.copy')}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  {t('members.done')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleAddMember} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="member-email">{t('fields.email')}</Label>
                <Input
                  id="member-email"
                  type="email"
                  autoFocus
                  placeholder="teammate@example.com"
                  value={email}
                  aria-invalid={emailError !== null}
                  aria-describedby={
                    emailError !== null ? 'member-email-error' : undefined
                  }
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError(null);
                  }}
                />
                {emailError !== null ? (
                  <p
                    id="member-email-error"
                    className="text-sm text-destructive"
                  >
                    {emailError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">{t('members.role')}</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) =>
                    setInviteRole(value as OrganizationRole)
                  }
                >
                  <SelectTrigger
                    id="member-role"
                    aria-describedby="member-role-hint"
                  >
                    <SelectValue>{formatRole(inviteRole, t)}</SelectValue>
                  </SelectTrigger>
                  <RoleOptions canManageOwners={canManageOwners} />
                </Select>
                <p
                  id="member-role-hint"
                  className="text-sm text-muted-foreground"
                >
                  {inviteRole === 'MEMBER'
                    ? t('members.roleHintMember')
                    : t('members.roleHintInvite')}
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? t('members.adding')
                    : inviteRole === 'MEMBER'
                      ? t('members.addMember')
                      : t('members.createInvitation')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {canManageMembers ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <h2>{t('members.pendingInvitations')}</h2>
            </CardTitle>
            <CardDescription>{t('members.pendingDescription')}</CardDescription>
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
              <RouteError
                title={t('members.invitationsLoadError')}
                onRetry={() => void invitations.refetch()}
              />
            ) : null}

            {invitations.data && invitations.data.invitations.length === 0 ? (
              <EmptyState
                icon={Mail}
                title={t('members.noInvitations')}
                description={t('members.noInvitationsDescription')}
              />
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
                        {t('members.expires', {
                          date: formatDateTime(invitation.expiresAt, locale),
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">
                        {formatRole(invitation.role, t)}
                      </Badge>
                      {invitation.role !== 'OWNER' || canManageOwners ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            setInvitationToRevoke({
                              id: invitation.id,
                              email: invitation.email,
                            })
                          }
                        >
                          {t('members.revoke')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={roleChange !== null}
        onCancel={() => setRoleChange(null)}
        title={t('members.changeRoleTitle')}
        description={
          roleChange === null
            ? ''
            : roleChange.to === 'OWNER'
              ? t('members.changeRoleOwnerDescription', {
                  name: roleChange.name,
                })
              : t('members.changeRoleDescription', {
                  name: roleChange.name,
                  from: formatRole(roleChange.from, t),
                  to: formatRole(roleChange.to, t),
                })
        }
        actionLabel={
          updateRole.isPending ? t('common.changing') : t('members.changeRole')
        }
        pending={updateRole.isPending}
        destructive={false}
        onConfirm={() => {
          if (roleChange) void confirmRoleChange(roleChange);
        }}
      />

      <ConfirmDialog
        open={invitationToRevoke !== null}
        onCancel={() => setInvitationToRevoke(null)}
        title={t('members.revokeTitle')}
        description={
          invitationToRevoke
            ? t('members.revokeDescription', {
                email: invitationToRevoke.email,
              })
            : ''
        }
        actionLabel={
          revokeInvitation.isPending
            ? t('members.revoking')
            : t('members.revoke')
        }
        pending={revokeInvitation.isPending}
        destructive
        onConfirm={() => {
          if (invitationToRevoke) void confirmRevoke(invitationToRevoke);
        }}
      />

      <ConfirmDialog
        open={memberToRemove !== null}
        onCancel={() => setMemberToRemove(null)}
        title={t('members.removeTitle')}
        description={
          memberToRemove
            ? t('members.removeDescriptionNamed', { name: memberToRemove.name })
            : t('members.removeDescription')
        }
        actionLabel={
          removeMember.isPending ? t('members.removing') : t('members.remove')
        }
        pending={removeMember.isPending}
        destructive
        onConfirm={() => {
          if (memberToRemove) void confirmRemove(memberToRemove);
        }}
      />
    </>
  );
}

function RoleOptions({
  canManageOwners,
}: Readonly<{ canManageOwners: boolean }>) {
  const t = useT();
  return (
    <SelectContent>
      {canManageOwners ? (
        <SelectItem value="OWNER">{t('members.roleOptions.OWNER')}</SelectItem>
      ) : null}
      <SelectItem value="ADMIN">{t('members.roleOptions.ADMIN')}</SelectItem>
      <SelectItem value="MEMBER">{t('members.roleOptions.MEMBER')}</SelectItem>
      <SelectItem value="VIEWER">{t('members.roleOptions.VIEWER')}</SelectItem>
    </SelectContent>
  );
}

function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  actionLabel,
  pending,
  destructive,
}: Readonly<{
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  actionLabel: string;
  pending: boolean;
  destructive: boolean;
}>) {
  const t = useT();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive ? buttonVariants({ variant: 'destructive' }) : ''
            }
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function inviteLink(token: string): string {
  return `${window.location.origin}/invitations/accept?token=${encodeURIComponent(token)}`;
}

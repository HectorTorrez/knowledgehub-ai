import type {
  OrganizationInvitationDetail,
  OrganizationRole,
} from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CalendarDays,
  Copy,
  FileText,
  Mail,
  MessageSquareText,
  Search,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
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
import { Progress } from '~/components/ui/progress';
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
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { conversationsApi } from '~/lib/api/conversations';
import { documentsApi } from '~/lib/api/documents';
import { onboardingSteps } from '~/lib/onboarding';
import { invitationsApi } from '~/lib/api/invitations';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { isNotFound } from '~/lib/api/errors';
import { cn } from '~/lib/utils';
import { formatDate, formatDateTime, formatRole } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/provider';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { memberEmailSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('overview.pageTitle'),
      description: t('overview.pageDescription'),
    });
  },
  component: OrganizationOverviewPage,
});

interface MemberToRemove {
  userId: string;
  name: string;
}

function OrganizationOverviewPage() {
  const t = useT();
  const locale = useLocale();
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const reportError = useReportError();
  const session = useSession();
  const readyDocuments = useReadyDocuments(organizationId);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [inviteResult, setInviteResult] =
    useState<OrganizationInvitationDetail | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberToRemove | null>(
    null,
  );

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

  useQueryErrorToast(organization.error, () => void organization.refetch());
  useQueryErrorToast(members.error, () => void members.refetch());

  const canManageMembers =
    organization.data?.organization.capabilities.includes('members.manage') ??
    false;
  const canManageOwners =
    organization.data?.organization.capabilities.includes('owners.manage') ??
    false;
  const canWrite =
    organization.data?.organization.capabilities.includes('documents.write') ??
    false;
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('MEMBER');
  const allDocuments = useQuery({
    queryKey: ['onboarding', organizationId, 'documents'],
    queryFn: () => documentsApi.list(organizationId, { limit: 1 }),
  });
  const readyForOnboarding = useQuery({
    queryKey: ['onboarding', organizationId, 'ready'],
    queryFn: () =>
      documentsApi.list(organizationId, { limit: 1, status: 'READY' }),
  });
  const conversations = useQuery({
    queryKey: ['onboarding', organizationId, 'conversations'],
    queryFn: () => conversationsApi.list(organizationId, { limit: 1 }),
  });

  const usage = useQuery({
    queryKey: queryKeys.organizations.usage(organizationId),
    queryFn: () => organizationsApi.usage(organizationId),
  });

  const invitations = useQuery({
    queryKey: queryKeys.organizations.invitations.list(organizationId),
    queryFn: () => invitationsApi.list(organizationId),
    enabled: canManageMembers,
  });
  useQueryErrorToast(usage.error, () => void usage.refetch());
  useQueryErrorToast(invitations.error, () => void invitations.refetch());

  const addMember = useMutation({
    mutationFn: (input: { organizationId: string; email: string }) =>
      organizationsApi.addMember(input.organizationId, { email: input.email }),
    onSuccess: (data, variables) => {
      toast({
        variant: 'success',
        title: t('overview.memberAdded'),
        description: t('overview.memberAddedDescription', {
          email: data.member.email,
        }),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
    onError: (error) => {
      if (!isNotFound(error)) {
        reportError(error);
      }
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
        title: t('overview.roleUpdated'),
        description: t('overview.roleUpdatedDescription', {
          email: data.member.email,
          role: formatRole(data.member.role, t),
        }),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
    onError: (error) => reportError(error),
  });

  const createInvitation = useMutation({
    mutationFn: (input: {
      organizationId: string;
      email: string;
      role: OrganizationRole;
    }) =>
      invitationsApi.create(input.organizationId, {
        email: input.email,
        role: input.role,
      }),
    onSuccess: (data, variables) => {
      setInviteResult(data.invitation);
      setEmail('');
      toast({
        variant: 'success',
        title: t('overview.invitationCreated'),
        description: t('overview.invitationCreatedDescription', {
          email: data.invitation.email,
        }),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.invitations.list(
          variables.organizationId,
        ),
      });
    },
    onError: (error) => reportError(error),
  });

  const revokeInvitation = useMutation({
    mutationFn: (input: { organizationId: string; invitationId: string }) =>
      invitationsApi.revoke(input.organizationId, input.invitationId),
    onSuccess: (_data, variables) => {
      toast({ variant: 'success', title: t('overview.invitationRevoked') });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.invitations.list(
          variables.organizationId,
        ),
      });
    },
    onError: (error) => reportError(error),
  });

  const removeMember = useMutation({
    mutationFn: (input: { organizationId: string; userId: string }) =>
      organizationsApi.removeMember(input.organizationId, input.userId),
    onSuccess: (_data, variables) => {
      toast({ variant: 'success', title: t('overview.memberRemoved') });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.members(variables.organizationId),
      });
    },
    onError: (error) => reportError(error),
  });

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = memberEmailSchema(t).safeParse({ email });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    if (inviteRole !== 'MEMBER') {
      try {
        await createInvitation.mutateAsync({
          organizationId,
          email: result.data.email,
          role: inviteRole,
        });
      } catch {
        return;
      }
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
          role: inviteRole,
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
      toast({ variant: 'success', title: t('overview.linkCopied') });
    } catch {
      toast({
        variant: 'error',
        title: t('overview.copyFailed'),
        description: t('overview.copyFailedDescription'),
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

  const storageKey = `onboarding:${currentUserId}:${organizationId}`;
  let storedDismissal: boolean;
  try {
    storedDismissal = localStorage.getItem(storageKey) === 'dismissed';
  } catch {
    storedDismissal = false;
  }
  const steps = onboardingSteps({
    documents: allDocuments.data?.documents.length ?? 0,
    readyDocuments: readyForOnboarding.data?.documents.length ?? 0,
    conversations: conversations.data?.conversations.length ?? 0,
    members: members.data?.members.length ?? 0,
    invitations: invitations.data?.invitations.length ?? 0,
    canManageMembers,
  });
  const checklistLoaded =
    currentUserId &&
    organization.data &&
    members.data &&
    allDocuments.data &&
    readyForOnboarding.data &&
    conversations.data &&
    (!canManageMembers || invitations.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          organization.data?.organization.name ?? t('overview.defaultTitle')
        }
        description={t('overview.description')}
      />

      {checklistLoaded &&
      !storedDismissal &&
      dismissedKey !== storageKey &&
      steps.some((step) => !step.complete) ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{t('overview.getStarted')}</CardTitle>
              <CardDescription>
                {t('overview.getStartedDescription')}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  localStorage.setItem(storageKey, 'dismissed');
                } catch {
                  setDismissedKey(storageKey);
                }
                setDismissedKey(storageKey);
              }}
            >
              {t('overview.dismiss')}
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {steps.map((step) => (
                <li key={step.id} className="flex items-center gap-3 text-sm">
                  <span
                    aria-label={
                      step.complete
                        ? t('overview.complete')
                        : t('overview.notComplete')
                    }
                    className={
                      step.complete ? 'text-brand' : 'text-muted-foreground'
                    }
                  >
                    {step.complete ? '✓' : '○'}
                  </span>
                  {step.id === 'invite' ? (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setAddMemberOpen(true)}
                    >
                      {t(step.labelKey)}
                    </button>
                  ) : (
                    <Link
                      className="underline underline-offset-4"
                      to={
                        step.id === 'ask'
                          ? '/organizations/$organizationId/ask'
                          : '/organizations/$organizationId/documents'
                      }
                      params={{ organizationId }}
                    >
                      {t(step.labelKey)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={FileText}
          label={t('overview.statReadyDocuments')}
          value={readyDocumentsLabel(
            readyDocuments.documents.length,
            readyDocuments.query.data?.nextCursor != null,
          )}
          pending={readyDocuments.query.isPending}
        />
        <StatTile
          icon={Users}
          label={t('overview.statMembers')}
          value={members.data?.members.length ?? '—'}
          pending={members.isPending}
        />
        <StatTile
          icon={Shield}
          label={t('overview.statYourRole')}
          value={
            organization.data
              ? formatRole(organization.data.organization.role, t)
              : '—'
          }
          pending={organization.isPending}
        />
        <StatTile
          icon={CalendarDays}
          label={t('overview.statCreated')}
          value={
            organization.data
              ? formatDate(organization.data.organization.createdAt, locale)
              : '—'
          }
          pending={organization.isPending}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Button asChild variant="outline" className="min-h-11 sm:min-h-0">
            <Link
              to="/organizations/$organizationId/documents"
              params={{ organizationId }}
            >
              <Upload />
              {t('overview.uploadDocument')}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="min-h-11 sm:min-h-0">
          <Link
            to="/organizations/$organizationId/ask"
            params={{ organizationId }}
          >
            <MessageSquareText />
            {t('overview.askQuestion')}
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 sm:min-h-0">
          <Link
            to="/organizations/$organizationId/search"
            params={{ organizationId }}
            search={{
              q: undefined,
              collectionIds: [],
              documentIds: [],
              createdAfter: '',
              createdBefore: '',
            }}
          >
            <Search />
            {t('overview.searchDocuments')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.dailyUsage')}</CardTitle>
          <CardDescription>
            {t('overview.dailyUsageDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage.isPending ? <Skeleton className="h-12 w-full" /> : null}
          {usage.isError ? (
            <RouteError
              title={t('orgSettings.usageLoadError')}
              onRetry={() => void usage.refetch()}
            />
          ) : null}
          {usage.data ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {t('overview.answersOf', {
                    used: usage.data.usage.answers.used,
                    limit: usage.data.usage.answers.limit,
                  })}
                </span>
                <span className="text-muted-foreground">
                  {t('overview.resetsOn', {
                    date: formatDateTime(
                      usage.data.usage.answers.resetsAt,
                      locale,
                    ),
                  })}
                </span>
              </div>
              <Progress
                value={Math.min(
                  100,
                  Math.round(
                    (usage.data.usage.answers.used /
                      usage.data.usage.answers.limit) *
                      100,
                  ),
                )}
                aria-valuemin={0}
                aria-valuemax={usage.data.usage.answers.limit}
                aria-valuenow={usage.data.usage.answers.used}
                aria-label={t('overview.dailyUsage')}
                indicatorClassName={cn(
                  usage.data.usage.answers.used >=
                    usage.data.usage.answers.limit && 'bg-destructive',
                )}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={addMemberOpen} onOpenChange={handleAddMemberOpenChange}>
        <Card>
          <div className="flex flex-col items-start gap-3 p-4 pb-0 sm:flex-row sm:p-6 sm:pb-0 sm:items-start sm:justify-between sm:gap-4">
            <div className="space-y-1.5">
              <h2 className="font-semibold leading-none tracking-tight">
                {t('overview.membersTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('overview.membersDescription')}
              </p>
            </div>
            {canManageMembers ? (
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserPlus />
                  {t('overview.addMember')}
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
              <RouteError
                title={t('overview.membersLoadError')}
                onRetry={() => void members.refetch()}
              />
            ) : null}
            {members.data && members.data.members.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title={t('overview.noMembers')}
                description={t('overview.noMembersDescription')}
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
                              {t('overview.you')}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                      {canManageMembers &&
                      (member.role !== 'OWNER' || canManageOwners) &&
                      member.userId !== currentUserId ? (
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
                            aria-label={t('overview.roleFor', {
                              email: member.email,
                            })}
                            disabled={updateRole.isPending}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {canManageOwners ? (
                              <SelectItem value="OWNER">
                                {t('overview.roleOptions.OWNER')}
                              </SelectItem>
                            ) : null}
                            <SelectItem value="ADMIN">
                              {t('overview.roleOptions.ADMIN')}
                            </SelectItem>
                            <SelectItem value="MEMBER">
                              {t('overview.roleOptions.MEMBER')}
                            </SelectItem>
                            <SelectItem value="VIEWER">
                              {t('overview.roleOptions.VIEWER')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">
                          {formatRole(member.role, t)}
                        </Badge>
                      )}
                      {canManageMembers &&
                      (member.role !== 'OWNER' || canManageOwners) &&
                      member.userId !== currentUserId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('overview.removeMemberLabel', {
                            email: member.email,
                          })}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            setMemberToRemove({
                              userId: member.userId,
                              name:
                                `${member.firstName} ${member.lastName}`.trim() ||
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
          </CardContent>
        </Card>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('overview.addMemberTitle')}</DialogTitle>
            <DialogDescription>
              {t('overview.addMemberDescription')}
            </DialogDescription>
          </DialogHeader>

          {inviteResult !== null ? (
            <div className="space-y-4">
              <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm">
                <p className="font-medium">
                  {t('overview.inviteReady', { email: inviteResult.email })}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t('overview.inviteExpires', {
                    date: formatDateTime(inviteResult.expiresAt, locale),
                  })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-link">
                  {t('overview.invitationLink')}
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
                    onClick={() => void copyInviteLink()}
                  >
                    <Copy />
                    {t('overview.copy')}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  {t('overview.done')}
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
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('overview.role')}</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) =>
                    setInviteRole(value as OrganizationRole)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canManageOwners ? (
                      <SelectItem value="OWNER">
                        {t('overview.roleOptions.OWNER')}
                      </SelectItem>
                    ) : null}
                    <SelectItem value="ADMIN">
                      {t('overview.roleOptions.ADMIN')}
                    </SelectItem>
                    <SelectItem value="MEMBER">
                      {t('overview.roleOptions.MEMBER')}
                    </SelectItem>
                    <SelectItem value="VIEWER">
                      {t('overview.roleOptions.VIEWER')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddMemberOpenChange(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={addMember.isPending || createInvitation.isPending}
                >
                  {addMember.isPending || createInvitation.isPending
                    ? t('overview.adding')
                    : t('overview.addOrInvite')}
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
              {t('overview.pendingInvitations')}
            </CardTitle>
            <CardDescription>
              {t('overview.pendingDescription')}
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
              <RouteError
                title={t('overview.invitationsLoadError')}
                onRetry={() => void invitations.refetch()}
              />
            ) : null}
            {invitations.data && invitations.data.invitations.length === 0 ? (
              <EmptyState
                icon={Mail}
                title={t('overview.noInvitations')}
                description={t('overview.noInvitationsDescription')}
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
                        {t('overview.expires', {
                          date: formatDateTime(invitation.expiresAt, locale),
                        })}
                      </p>
                    </div>
                    {invitation.role !== 'OWNER' || canManageOwners ? (
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
                        {t('overview.revoke')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('overview.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? t('overview.removeDescriptionNamed', {
                    name: memberToRemove.name,
                  })
                : t('overview.removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={removeMember.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (memberToRemove) {
                  void handleRemoveMember(memberToRemove);
                }
              }}
            >
              {removeMember.isPending
                ? t('overview.removing')
                : t('overview.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  pending,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string | number;
  pending: boolean;
}>) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="rounded-lg bg-brand/10 p-2 text-brand">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {pending ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function inviteLink(token: string): string {
  return `${window.location.origin}/invitations/accept?token=${encodeURIComponent(token)}`;
}

function readyDocumentsLabel(count: number, hasMore: boolean): string | number {
  return hasMore ? `${count}+` : count;
}

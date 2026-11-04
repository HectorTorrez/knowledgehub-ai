import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Circle,
  CircleCheck,
  FileText,
  MessageSquareText,
  Search,
  Shield,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { DocumentStatusBadge } from '~/components/document-status-badge';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import { useSession } from '~/hooks/use-auth';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { conversationsApi } from '~/lib/api/conversations';
import { documentsApi } from '~/lib/api/documents';
import { invitationsApi } from '~/lib/api/invitations';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDate, formatDateTime, formatRole } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { onboardingSteps } from '~/lib/onboarding';
import { pageHead } from '~/lib/seo';
import { usageProgress } from '~/lib/usage';
import { cn } from '~/lib/utils';

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

const RECENT_DOCUMENTS_LIMIT = 5;

function OrganizationOverviewPage() {
  const t = useT();
  const locale = useLocale();
  const { organizationId } = Route.useParams();
  const session = useSession();
  const readyDocuments = useReadyDocuments(organizationId);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

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

  const canManageMembers =
    organization.data?.organization.capabilities.includes('members.manage') ??
    false;
  const canWrite =
    organization.data?.organization.capabilities.includes('documents.write') ??
    false;
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
  const recentDocuments = useQuery({
    queryKey: [
      ...queryKeys.organizations.documents.all(organizationId),
      'recent',
    ],
    queryFn: () =>
      documentsApi.list(organizationId, {
        limit: RECENT_DOCUMENTS_LIMIT,
        order: 'createdAt_desc',
      }),
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
                rememberDismissal(storageKey);
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
                  {step.complete ? (
                    <CircleCheck
                      aria-hidden="true"
                      className="size-4 shrink-0 text-brand"
                    />
                  ) : (
                    <Circle
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="sr-only">
                    {step.complete
                      ? t('overview.complete')
                      : t('overview.notComplete')}
                  </span>
                  <Link
                    className="underline underline-offset-4"
                    to={onboardingStepRoute(step.id)}
                    params={{ organizationId }}
                  >
                    {t(step.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
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
        <Button asChild className="min-h-11 sm:min-h-0">
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
              <AnswerUsageBar
                used={usage.data.usage.answers.used}
                limit={usage.data.usage.answers.limit}
                label={t('overview.dailyUsage')}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="space-y-1.5">
            <CardTitle>
              <h2>{t('overview.recentDocuments')}</h2>
            </CardTitle>
            <CardDescription>
              {t('overview.recentDocumentsDescription')}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/organizations/$organizationId/documents"
              params={{ organizationId }}
            >
              {t('overview.viewAllDocuments')}
              <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentDocuments.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : null}
          {recentDocuments.isError ? (
            <RouteError
              title={t('overview.recentDocumentsLoadError')}
              onRetry={() => void recentDocuments.refetch()}
            />
          ) : null}
          {recentDocuments.data &&
          recentDocuments.data.documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('overview.noRecentDocuments')}
              description={t('overview.noRecentDocumentsDescription')}
              action={
                canWrite ? (
                  <Button asChild>
                    <Link
                      to="/organizations/$organizationId/documents"
                      params={{ organizationId }}
                    >
                      <Upload />
                      {t('overview.uploadDocument')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {recentDocuments.data && recentDocuments.data.documents.length > 0 ? (
            <ul className="divide-y">
              {recentDocuments.data.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <Link
                        to="/organizations/$organizationId/documents/$documentId"
                        params={{ organizationId, documentId: document.id }}
                        className="block truncate text-sm font-medium hover:underline hover:underline-offset-4"
                      >
                        {document.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(document.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                  <DocumentStatusBadge status={document.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function rememberDismissal(storageKey: string) {
  try {
    localStorage.setItem(storageKey, 'dismissed');
  } catch {
    return;
  }
}

function onboardingStepRoute(
  stepId: ReturnType<typeof onboardingSteps>[number]['id'],
) {
  if (stepId === 'ask') return '/organizations/$organizationId/ask' as const;
  if (stepId === 'invite')
    return '/organizations/$organizationId/settings' as const;
  return '/organizations/$organizationId/documents' as const;
}

function AnswerUsageBar({
  used,
  limit,
  label,
}: Readonly<{ used: number; limit: number; label: string }>) {
  const progress = usageProgress(used, limit);
  return (
    <Progress
      value={progress.value}
      aria-label={label}
      indicatorClassName={cn(
        progress.tone === 'destructive' && 'bg-destructive',
        progress.tone === 'warning' && 'bg-amber-500',
      )}
    />
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

function readyDocumentsLabel(count: number, hasMore: boolean): string | number {
  return hasMore ? `${count}+` : count;
}

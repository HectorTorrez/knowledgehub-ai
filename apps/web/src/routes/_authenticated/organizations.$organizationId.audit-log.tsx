import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { History } from 'lucide-react';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
import { DatePicker } from '~/components/date-picker';
import { PageHeader } from '~/components/page-header';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { activityApi } from '~/lib/api/activity';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { activityActionLabel, formatActivity } from '~/lib/activity-format';
import { auditCsv } from '~/lib/audit-csv';
import { useLocale, useT } from '~/lib/i18n/hooks';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/audit-log',
)({
  component: AuditLogPage,
});

const actions: OrganizationActivityItem['action'][] = [
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_LEFT',
  'INVITATION_CREATED',
  'INVITATION_REVOKED',
  'INVITATION_ACCEPTED',
  'ORGANIZATION_RENAMED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_RENAMED',
  'DOCUMENT_DELETED',
  'CONVERSATION_SHARED',
  'CONVERSATION_UNSHARED',
  'DOCUMENT_REPROCESSED',
];

function AuditLogPage() {
  const t = useT();
  const locale = useLocale();
  const { organizationId } = Route.useParams();
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const allowed =
    organization.data?.organization.capabilities.includes('members.manage') ??
    false;
  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
    enabled: allowed,
  });
  const activity = useInfiniteQuery({
    queryKey: [
      'organizations',
      organizationId,
      'audit-log',
      action,
      actorId,
      from,
      to,
    ],
    queryFn: ({ pageParam }) =>
      activityApi.list(organizationId, {
        cursor: pageParam,
        action,
        actorId,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '',
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: allowed,
  });
  useQueryErrorToast(organization.error, () => void organization.refetch());
  useQueryErrorToast(members.error, () => void members.refetch());
  useQueryErrorToast(activity.error, () => void activity.refetch());
  const rows = activity.data?.pages.flatMap((page) => page.activities) ?? [];
  function download() {
    const url = URL.createObjectURL(
      new Blob([auditCsv(rows, t, locale)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${(organization.data?.organization.name ?? 'workspace').replace(/[^a-zA-Z0-9-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (organization.isPending) return <Skeleton className="h-32 w-full" />;
  if (organization.isError)
    return (
      <RouteError
        title={t('auditLog.workspaceError')}
        onRetry={() => void organization.refetch()}
      />
    );
  if (!allowed)
    return (
      <PageHeader
        title={t('auditLog.notAllowedTitle')}
        description={t('auditLog.notAllowedDescription')}
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.auditLog')}
        description={t('auditLog.description')}
      />
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">{t('auditLog.action')}</Label>
          <Select
            value={action || 'all'}
            onValueChange={(value) => setAction(value === 'all' ? '' : value)}
          >
            <SelectTrigger id="audit-action" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auditLog.allActions')}</SelectItem>
              {actions.map((value) => (
                <SelectItem key={value} value={value}>
                  {activityActionLabel(value, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-actor">{t('auditLog.actor')}</Label>
          <Select
            value={actorId || 'all'}
            onValueChange={(value) => setActorId(value === 'all' ? '' : value)}
          >
            <SelectTrigger id="audit-actor" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auditLog.allActors')}</SelectItem>
              {members.data?.members.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.firstName} {member.lastName} ({member.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DatePicker
          ariaLabel={t('auditLog.fromDate')}
          value={from}
          onChange={setFrom}
          placeholder={t('auditLog.fromDate')}
        />
        <DatePicker
          ariaLabel={t('auditLog.toDate')}
          value={to}
          onChange={setTo}
          placeholder={t('auditLog.toDate')}
        />
        <Button variant="outline" onClick={download} disabled={!rows.length}>
          {t('auditLog.exportCsv')}
        </Button>
      </div>
      {activity.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : activity.isError ? (
        <RouteError
          title={t('auditLog.activityError')}
          onRetry={() => void activity.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={t('auditLog.noActivityTitle')}
          description={t('auditLog.noActivityDescription')}
          action={
            <Button
              onClick={() => {
                setAction('');
                setActorId('');
                setFrom('');
                setTo('');
              }}
            >
              {t('auditLog.clearFilters')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  t('auditLog.time'),
                  t('auditLog.actor'),
                  t('auditLog.action'),
                  t('auditLog.target'),
                  t('auditLog.details'),
                ].map((heading) => (
                  <th className="p-3" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">
                    {new Date(row.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="p-3">
                    {row.actor
                      ? `${row.actor.firstName} ${row.actor.lastName}`.trim() ||
                        row.actor.email
                      : t('activity.someone')}
                  </td>
                  <td className="p-3">{activityActionLabel(row.action, t)}</td>
                  <td className="p-3">
                    {row.targetType}
                    {row.targetId ? `: ${row.targetId}` : ''}
                  </td>
                  <td className="p-3">{formatActivity(row, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activity.hasNextPage ? (
        <Button
          variant="outline"
          disabled={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
        >
          {t('orgSettings.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

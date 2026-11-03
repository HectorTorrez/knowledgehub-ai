import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DatePicker } from '~/components/date-picker';
import { PageHeader } from '~/components/page-header';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { activityApi } from '~/lib/api/activity';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { activityActionLabel, formatActivity } from '~/lib/activity-format';
import { auditCsv } from '~/lib/audit-csv';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/audit-log',
)({
  component: AuditLogPage,
});

const actions = [
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
  const rows = activity.data?.pages.flatMap((page) => page.activities) ?? [];
  function download() {
    const url = URL.createObjectURL(
      new Blob([auditCsv(rows)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${(organization.data?.organization.name ?? 'workspace').replace(/[^a-zA-Z0-9-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (organization.isPending) return <Skeleton className="h-32 w-full" />;
  if (organization.isError)
    return <p>Unable to load the workspace. Please try again.</p>;
  if (!allowed)
    return (
      <PageHeader
        title="Not allowed"
        description="You do not have permission to view the audit log."
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Review activity in your workspace."
      />
      <div className="flex flex-wrap gap-3">
        <label>
          Action{' '}
          <select
            aria-label="Action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-md border p-2"
          >
            <option value="">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actor{' '}
          <select
            aria-label="Actor"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            className="rounded-md border p-2"
          >
            <option value="">All actors</option>
            {members.data?.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.firstName} {member.lastName} ({member.email})
              </option>
            ))}
          </select>
        </label>
        <DatePicker
          ariaLabel="From date"
          value={from}
          onChange={setFrom}
          placeholder="From date"
        />
        <DatePicker
          ariaLabel="To date"
          value={to}
          onChange={setTo}
          placeholder="To date"
        />
        <Button variant="outline" onClick={download} disabled={!rows.length}>
          Export CSV
        </Button>
      </div>
      {activity.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : activity.isError ? (
        <p>Unable to load activity. Please try again.</p>
      ) : rows.length === 0 ? (
        <p>No activity found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Time', 'Actor', 'Action', 'Target', 'Details'].map(
                  (heading) => (
                    <th className="p-3" key={heading}>
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {row.actor
                      ? `${row.actor.firstName} ${row.actor.lastName}`.trim() ||
                        row.actor.email
                      : 'Someone'}
                  </td>
                  <td className="p-3">{activityActionLabel(row.action)}</td>
                  <td className="p-3">
                    {row.targetType}
                    {row.targetId ? `: ${row.targetId}` : ''}
                  </td>
                  <td className="p-3">{formatActivity(row)}</td>
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
          Load more
        </Button>
      ) : null}
    </div>
  );
}

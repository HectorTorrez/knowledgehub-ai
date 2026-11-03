import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import { activityActionLabel, formatActivity } from './activity-format';

export function auditCsv(rows: OrganizationActivityItem[]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [
    ['Time', 'Actor', 'Action', 'Target', 'Details'],
    ...rows.map((row) => [
      row.createdAt,
      row.actor
        ? `${row.actor.firstName} ${row.actor.lastName}`.trim() ||
          row.actor.email
        : 'Someone',
      activityActionLabel(row.action),
      `${row.targetType}${row.targetId ? `: ${row.targetId}` : ''}`,
      formatActivity(row),
    ]),
  ]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
}

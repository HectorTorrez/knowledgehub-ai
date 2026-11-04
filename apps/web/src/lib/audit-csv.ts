import type { OrganizationActivityItem } from '@knowledgehub/shared-types';
import type { Locale } from '~/lib/i18n/locale';
import type { Translator } from '~/lib/i18n/translate';
import { formatDateTime } from '~/lib/format';
import { activityActionLabel, formatActivity } from './activity-format';

export function auditCsv(
  rows: OrganizationActivityItem[],
  t: Translator,
  locale: Locale,
): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [
    [
      t('auditLog.time'),
      t('auditLog.actor'),
      t('auditLog.action'),
      t('auditLog.target'),
      t('auditLog.details'),
    ],
    ...rows.map((row) => [
      formatDateTime(row.createdAt, locale),
      row.actor
        ? `${row.actor.firstName} ${row.actor.lastName}`.trim() ||
          row.actor.email
        : t('activity.someone'),
      activityActionLabel(row.action, t),
      `${row.targetType}${row.targetId ? `: ${row.targetId}` : ''}`,
      formatActivity(row, t),
    ]),
  ]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
}

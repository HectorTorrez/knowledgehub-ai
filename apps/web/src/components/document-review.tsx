import type {
  DocumentReview,
  DocumentSummary,
} from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { documentsApi } from '~/lib/api/documents';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import {
  DocumentDetailRow,
  DocumentDetailSection,
} from './document-detail-section';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function DocumentReviewBadge({ review }: { review?: DocumentReview }) {
  const t = useT();
  return review?.overdue ? (
    <Badge variant="destructive">{t('documentReview.overdue')}</Badge>
  ) : null;
}

export function DocumentReviewEditor({
  organizationId,
  document,
  canWrite,
}: {
  organizationId: string;
  document: DocumentSummary;
  canWrite: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const client = useQueryClient();
  const reportError = useReportError();
  const [ownerId, setOwnerId] = useState(document.review?.owner?.userId ?? '');
  const [dueDate, setDueDate] = useState(document.review?.dueDate ?? '');
  const members = useQuery({
    queryKey: queryKeys.organizations.members(organizationId),
    queryFn: () => organizationsApi.members(organizationId),
    enabled: canWrite,
  });
  useQueryErrorToast(members.error);
  const update = useMutation({
    mutationFn: (markReviewed: boolean) =>
      documentsApi.updateReview(organizationId, document.id, {
        ownerId: ownerId || null,
        dueDate: markReviewed ? null : dueDate || null,
        markReviewed,
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.detail(
            organizationId,
            document.id,
          ),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.list(organizationId),
        }),
      ]),
    onError: (error) => reportError(error),
  });
  const review = document.review;
  const ownerName = review?.owner
    ? `${review.owner.firstName} ${review.owner.lastName}`
    : t('documentReview.unassigned');

  return (
    <DocumentDetailSection title={t('documentDetail.review')}>
      <p className="text-xs text-muted-foreground">
        {review?.lastReviewedAt
          ? t('documentReview.reviewed', {
              date: formatDateTime(review.lastReviewedAt, locale),
            })
          : t('documentReview.never')}
      </p>
      {canWrite ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-owner`}>{t('documentReview.owner')}</Label>
            <select
              id={`${id}-owner`}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">{t('documentReview.unassigned')}</option>
              {members.data?.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`}>{t('documentReview.dueDate')}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              className="h-10"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={
                update.isPending || members.isPending || members.isError
              }
            >
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={
                update.isPending ||
                document.status !== 'READY' ||
                members.isPending ||
                members.isError
              }
              onClick={() => update.mutate(true)}
            >
              {t('documentReview.markReviewed')}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="space-y-2">
          <DocumentDetailRow label={t('documentReview.owner')}>
            {ownerName}
          </DocumentDetailRow>
          <DocumentDetailRow label={t('documentReview.dueDate')}>
            {review?.dueDate ?? '—'}
          </DocumentDetailRow>
        </dl>
      )}
    </DocumentDetailSection>
  );
}

import type { DocumentVersionSummary } from '@knowledgehub/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { replaceDocumentFile } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import {
  uploadRejectionMessage,
  validateUploadFile,
} from '~/lib/upload-validation';
import { useReportError } from '~/hooks/use-error-toast';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function DocumentVersions({
  organizationId,
  documentId,
  generation,
  currentGeneration,
  versions,
  canReplace,
}: {
  organizationId: string;
  documentId: string;
  generation?: number;
  currentGeneration?: number;
  versions: DocumentVersionSummary[];
  canReplace: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const client = useQueryClient();
  const reportError = useReportError();
  const replacement = useMutation({
    mutationFn: async (file: File) => {
      const validation = await validateUploadFile(file);
      if (!validation.ok)
        throw new Error(uploadRejectionMessage(validation.reason, t, locale));
      return replaceDocumentFile(
        organizationId,
        documentId,
        file,
        validation.contentType,
      );
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.detail(
            organizationId,
            documentId,
          ),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.list(organizationId),
        }),
        client.invalidateQueries({
          queryKey: ['document-versions', organizationId, documentId],
        }),
      ]),
    onError: (error) => reportError(error),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('documentVersions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {generation !== undefined &&
        currentGeneration !== undefined &&
        generation < currentGeneration ? (
          <p role="status" className="rounded-md border p-3 text-sm">
            {t('documentVersions.outdated', { generation })}
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-3">
          {versions.map((version) => (
            <li key={version.generation} className="text-sm">
              <Link
                className="text-brand underline"
                to="/organizations/$organizationId/documents/$documentId"
                params={{ organizationId, documentId }}
                search={{ generation: version.generation }}
              >
                {t('documentVersions.version', {
                  generation: version.generation,
                })}
              </Link>
              <p className="text-xs text-muted-foreground">
                {version.originalFileName} ·{' '}
                {formatDateTime(version.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {t('documentVersions.retention')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('documentVersions.legacy')}
        </p>
        {canReplace ? (
          <div className="space-y-2">
            <Label htmlFor={id}>{t('documentVersions.choose')}</Label>
            <Input
              id={id}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.html,.htm,.txt,.md,.markdown"
              disabled={replacement.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) replacement.mutate(file);
              }}
            />
          </div>
        ) : null}
        {replacement.isPending ? (
          <p role="status" className="text-sm">
            {t('documentVersions.uploading')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

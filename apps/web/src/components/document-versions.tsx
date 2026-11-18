import type { DocumentVersionSummary } from '@knowledgehub/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { replaceDocumentFile } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import {
  uploadRejectionMessage,
  validateUploadFile,
} from '~/lib/upload-validation';
import { useReportError } from '~/hooks/use-error-toast';
import { DocumentDetailSection } from './document-detail-section';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '~/lib/utils';

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
  const fileInput = useRef<HTMLInputElement>(null);
  const viewing = generation ?? currentGeneration;
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
    <DocumentDetailSection title={t('documentDetail.versions')}>
      {versions.length > 0 ? (
        <ol className="space-y-1">
          {versions.map((version) => {
            const isCurrent = version.generation === currentGeneration;
            const isViewing = version.generation === viewing;
            return (
              <li
                key={version.generation}
                className={cn(
                  'relative -mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted',
                  isViewing && 'bg-muted',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Link
                    className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    to="/organizations/$organizationId/documents/$documentId"
                    params={{ organizationId, documentId }}
                    search={isCurrent ? {} : { generation: version.generation }}
                    aria-current={isViewing ? 'page' : undefined}
                  >
                    {t('documentVersions.version', {
                      generation: version.generation,
                    })}
                  </Link>
                  {isCurrent ? (
                    <Badge variant="secondary">
                      {t('documentDetail.currentVersion')}
                    </Badge>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {version.originalFileName} ·{' '}
                  {formatDateTime(version.createdAt, locale)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('documentDetail.noVersions')}
        </p>
      )}
      {canReplace ? (
        <>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('documentVersions.choose')}
            accept=".pdf,.docx,.pptx,.xlsx,.html,.htm,.txt,.md,.markdown"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) replacement.mutate(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={replacement.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            {replacement.isPending
              ? t('documentVersions.uploading')
              : t('documentVersions.replace')}
          </Button>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('documentVersions.retention')}
      </p>
    </DocumentDetailSection>
  );
}

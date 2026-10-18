import type { DocumentSummary } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  documentTitleSchema,
  isAllowedUploadContentType,
} from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/documents',
)({
  component: DocumentsPage,
});

const ACTIVE_STATUSES = new Set<DocumentSummary['status']>(['PENDING', 'PROCESSING']);

const STATUS_CLASSES: Record<DocumentSummary['status'], string> = {
  PENDING: 'bg-muted text-muted-foreground',
  PROCESSING: 'bg-secondary text-secondary-foreground',
  READY: 'bg-primary/10 text-foreground',
  FAILED: 'bg-destructive/10 text-destructive',
};

function DocumentsPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const listKey = queryKeys.organizations.documents.list(organizationId);

  const documents = useQuery({
    queryKey: listKey,
    queryFn: () => documentsApi.list(organizationId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const active = data?.documents.some((entry) => ACTIVE_STATUSES.has(entry.status));

      return active ? 3000 : false;
    },
  });

  const upload = useMutation({
    mutationFn: async (input: {
      organizationId: string;
      title: string;
      file: File;
    }) => {
      const created = await documentsApi.create(input.organizationId, {
        title: input.title,
      });
      const documentId = created.document.id;
      const target = await documentsApi.createUploadUrl(
        input.organizationId,
        documentId,
        {
          contentType: input.file.type || 'application/octet-stream',
          sizeBytes: input.file.size,
        },
      );

      const response = await fetch(target.uploadUrl, {
        method: target.method,
        headers: target.headers,
        body: input.file,
      });

      if (!response.ok) {
        throw new Error(`The storage upload failed with status ${response.status}.`);
      }

      return documentsApi.completeUpload(input.organizationId, documentId, {
        originalFileName: input.file.name,
      });
    },
    onSettled: (_data, _error, variables) =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(variables.organizationId),
      }),
  });

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const form = event.currentTarget;
    const result = documentTitleSchema.safeParse({ title });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'A title is required.');
      return;
    }

    if (file === null) {
      setValidationError('Choose a file to upload.');
      return;
    }

    if (!isAllowedUploadContentType(file.type)) {
      setValidationError(
        'Unsupported file type. Upload a PDF, plain text, or Markdown file.',
      );
      return;
    }

    try {
      await upload.mutateAsync({ organizationId, title: result.data.title, file });
      setTitle('');
      setFile(null);
      form.reset();
    } catch {
      return;
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Documents</h2>
        {documents.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {documents.isError ? <ErrorNotice error={documents.error} /> : null}
        {documents.data && documents.data.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents yet. Upload one below.
          </p>
        ) : null}
        {documents.data && documents.data.documents.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {documents.data.documents.map((document) => (
              <li key={document.id} className="space-y-1 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{document.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[document.status]}`}
                  >
                    {document.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {document.originalFileName ?? 'Upload pending'}
                  {document.sizeBytes !== null
                    ? ` · ${formatBytes(document.sizeBytes)}`
                    : ''}
                </p>
                {document.status === 'FAILED' ? (
                  <p className="text-xs text-destructive">
                    {document.failureKind === 'VERIFICATION'
                      ? 'Upload verification failed'
                      : 'Processing failed'}
                    {document.failureReason ? `: ${document.failureReason}` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Upload a document</h2>
        <form onSubmit={handleUpload} className="space-y-3" noValidate>
          {validationError ? <ErrorNotice error={new Error(validationError)} /> : null}
          {upload.isError ? <ErrorNotice error={upload.error} /> : null}
          <input
            aria-label="Document title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Employee handbook"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            aria-label="Document file"
            type="file"
            accept={ALLOWED_UPLOAD_CONTENT_TYPES.join(',')}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={upload.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

import type { DocumentSummary } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FileText, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DocumentStatusBadge } from '~/components/document-status-badge';
import { EmptyState } from '~/components/empty-state';
import { FileDropzone } from '~/components/file-dropzone';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
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
import { Skeleton } from '~/components/ui/skeleton';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatBytes } from '~/lib/format';
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

function DocumentsPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const documents = useQuery({
    queryKey: queryKeys.organizations.documents.list(organizationId),
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
      setUploadOpen(false);
    } catch {
      return;
    }
  }

  const hasDocuments =
    documents.data !== undefined && documents.data.documents.length > 0;

  return (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
      <div className="space-y-8">
        <PageHeader
          title="Documents"
          description="Upload documents and ask questions grounded in their contents."
          action={
            <DialogTrigger asChild>
              <Button>
                <Upload />
                Upload document
              </Button>
            </DialogTrigger>
          }
        />

        {documents.isError ? <ErrorNotice error={documents.error} /> : null}

        {documents.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : null}

        {!documents.isPending && !hasDocuments ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload a document to start asking questions about it."
            action={
              <DialogTrigger asChild>
                <Button>
                  <Upload />
                  Upload document
                </Button>
              </DialogTrigger>
            }
          />
        ) : null}

        {hasDocuments ? (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {documents.data?.documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center gap-4 px-6 py-4"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {document.title}
                        </p>
                        <DocumentStatusBadge status={document.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {document.originalFileName ?? 'Upload pending'}
                        {document.sizeBytes !== null
                          ? ` · ${formatBytes(document.sizeBytes)}`
                          : ''}
                      </p>
                      {document.status === 'FAILED' ? (
                        <p className="mt-0.5 text-xs text-destructive">
                          {document.failureKind === 'VERIFICATION'
                            ? 'Upload verification failed'
                            : 'Processing failed'}
                          {document.failureReason ? `: ${document.failureReason}` : ''}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Add a PDF, plain text, or Markdown file to this organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpload} className="space-y-4" noValidate>
          {validationError ? (
            <ErrorNotice error={new Error(validationError)} />
          ) : null}
          {upload.isError ? <ErrorNotice error={upload.error} /> : null}
          <div className="space-y-2">
            <Label htmlFor="document-title">Title</Label>
            <Input
              id="document-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Employee handbook"
            />
          </div>
          <FileDropzone
            accept={ALLOWED_UPLOAD_CONTENT_TYPES.join(',')}
            file={file}
            onFileChange={setFile}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

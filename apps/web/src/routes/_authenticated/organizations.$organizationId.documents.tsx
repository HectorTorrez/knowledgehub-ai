import type { DocumentSummary } from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  FileText,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatBytes } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { cn } from '~/lib/utils';
import {
  MAX_PROCESSABLE_UPLOAD_BYTES,
  validateUploadFile,
} from '~/lib/upload-validation';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  documentTitleSchema,
} from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/documents',
)({
  head: () =>
    pageHead({
      title: 'Documents · KnowledgeHub AI',
      description:
        "Upload and manage the documents used to ground your organization's answers.",
    }),
  component: DocumentsPage,
});

const ACTIVE_STATUSES = new Set<DocumentSummary['status']>(['PENDING', 'PROCESSING']);

function DocumentsPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileValidationId = useRef(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);

  const documents = useInfiniteQuery({
    queryKey: queryKeys.organizations.documents.list(organizationId),
    queryFn: ({ pageParam }) =>
      documentsApi.list(organizationId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (query) => {
      const data = query.state.data;
      const active = data?.pages.some((page) =>
        page.documents.some((entry) => ACTIVE_STATUSES.has(entry.status)),
      );

      return active ? 3000 : false;
    },
  });

  const upload = useMutation({
    mutationFn: async (input: {
      organizationId: string;
      title: string;
      file: File;
      contentType: string;
    }) => {
      const created = await documentsApi.create(input.organizationId, {
        title: input.title,
      });
      const documentId = created.document.id;
      const target = await documentsApi.createUploadUrl(
        input.organizationId,
        documentId,
        {
          contentType: input.contentType,
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

  const rename = useMutation({
    mutationFn: (input: { documentId: string; title: string }) =>
      documentsApi.rename(organizationId, input.documentId, {
        title: input.title,
      }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(organizationId),
      }),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) =>
      documentsApi.remove(organizationId, documentId),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(organizationId),
      }),
  });

  async function handleFileChange(nextFile: File | null) {
    const validationId = fileValidationId.current + 1;
    fileValidationId.current = validationId;
    setFile(nextFile);
    setFileError(null);

    if (nextFile === null) {
      return;
    }

    const result = await validateUploadFile(nextFile);

    if (validationId !== fileValidationId.current) {
      return;
    }

    if (!result.ok) {
      setFileError(result.message);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    setFileError(null);

    const result = documentTitleSchema.safeParse({ title });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'A title is required.');
      return;
    }

    if (file === null) {
      setValidationError('Choose a file to upload.');
      return;
    }

    const fileResult = await validateUploadFile(file);

    if (!fileResult.ok) {
      setFileError(fileResult.message);
      return;
    }

    try {
      await upload.mutateAsync({
        organizationId,
        title: result.data.title,
        file,
        contentType: fileResult.contentType,
      });
      toast({
        variant: 'success',
        title: 'Document uploaded',
        description: `“${result.data.title}” is queued for processing.`,
      });
      setTitle('');
      setFile(null);
      setFileError(null);
      setUploadOpen(false);
    } catch {
      return;
    }
  }

  function openRename(document: DocumentSummary) {
    setRenameTarget(document);
    setRenameTitle(document.title);
    setRenameError(null);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) {
      return;
    }

    const result = documentTitleSchema.safeParse({ title: renameTitle });
    if (!result.success) {
      setRenameError(result.error.issues[0]?.message ?? 'A title is required.');
      return;
    }

    try {
      await rename.mutateAsync({
        documentId: renameTarget.id,
        title: result.data.title,
      });
      toast({ variant: 'success', title: 'Document renamed' });
      setRenameTarget(null);
    } catch {
      return;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      await remove.mutateAsync(deleteTarget.id);
      toast({
        variant: 'success',
        title: 'Document deleted',
        description: `“${deleteTarget.title}” was removed.`,
      });
      setDeleteTarget(null);
    } catch {
      return;
    }
  }

  const rows = documents.data?.pages.flatMap((page) => page.documents) ?? [];
  const hasDocuments = rows.length > 0;

  return (
    <>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <div className="space-y-8">
          <PageHeader
            title="Documents"
            description="Upload documents and ask questions grounded in their contents."
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Refresh documents"
                  onClick={() => void documents.refetch()}
                  disabled={documents.isFetching}
                >
                  <RefreshCw
                    className={cn(documents.isFetching && 'animate-spin')}
                  />
                </Button>
                <DialogTrigger asChild>
                  <Button>
                    <Upload />
                    Upload document
                  </Button>
                </DialogTrigger>
              </div>
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
            <div className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {rows.map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center gap-4 px-6 py-4"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              to="/organizations/$organizationId/documents/$documentId"
                              params={{ organizationId, documentId: document.id }}
                              className="truncate text-sm font-medium hover:underline"
                              title={document.title}
                            >
                              {document.title}
                            </Link>
                            <DocumentStatusBadge status={document.status} />
                          </div>
                          <p
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                            title={document.originalFileName ?? undefined}
                          >
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
                              {document.failureReason
                                ? `: ${document.failureReason}`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${document.title}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openRename(document)}>
                              <Pencil />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setDeleteTarget(document)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {documents.hasNextPage ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => documents.fetchNextPage()}
                    disabled={documents.isFetchingNextPage}
                  >
                    {documents.isFetchingNextPage ? (
                      <LoaderCircle className="animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
            <DialogDescription>
              Add a PDF, plain text, or Markdown file up to{' '}
              {formatBytes(MAX_PROCESSABLE_UPLOAD_BYTES)} to this organization.
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
            <div className="space-y-2">
              <FileDropzone
                accept={ALLOWED_UPLOAD_CONTENT_TYPES.join(',')}
                file={file}
                onFileChange={(nextFile) => void handleFileChange(nextFile)}
              />
              {fileError ? (
                <p role="alert" className="text-xs text-destructive">
                  {fileError}
                </p>
              ) : null}
            </div>
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

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              Change the display name of this document.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4" noValidate>
            {renameError ? <ErrorNotice error={new Error(renameError)} /> : null}
            {rename.isError ? <ErrorNotice error={rename.error} /> : null}
            <div className="space-y-2">
              <Label htmlFor="rename-title">Title</Label>
              <Input
                id="rename-title"
                autoFocus
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              This permanently removes “{deleteTarget?.title}” and everything
              derived from it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError ? <ErrorNotice error={remove.error} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

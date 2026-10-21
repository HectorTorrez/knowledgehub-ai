import type {
  DocumentStatus,
  DocumentSummary,
} from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CircleCheck,
  FileText,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { documentsApi, uploadFileToDocument } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatBytes } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { cn } from '~/lib/utils';
import {
  MAX_PROCESSABLE_UPLOAD_BYTES,
  titleFromFileName,
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
const ALL_STATUSES = 'ALL';
const SEARCH_DEBOUNCE_MS = 300;

type StatusFilter = DocumentStatus | typeof ALL_STATUSES;
type DocumentOrder = 'createdAt_desc' | 'createdAt_asc';
type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed';

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
}

function DocumentsPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [order, setOrder] = useState<DocumentOrder>('createdAt_desc');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(queryDraft.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [queryDraft]);

  const filters = {
    ...(query.length > 0 ? { q: query } : {}),
    ...(statusFilter === ALL_STATUSES ? {} : { status: statusFilter }),
    order,
  };
  const hasFilters =
    query.length > 0 || statusFilter !== ALL_STATUSES || order !== 'createdAt_desc';

  const documents = useInfiniteQuery({
    queryKey: queryKeys.organizations.documents.list(organizationId, filters),
    queryFn: ({ pageParam }) =>
      documentsApi.list(organizationId, { cursor: pageParam, ...filters }),
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

  function updateUploadItem(id: string, patch: Partial<UploadItem>) {
    setUploadItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function addFiles(next: File[]) {
    setUploadError(null);
    setValidationError(null);

    const seen = new Set(uploadItems.map((item) => fileKey(item.file)));
    const unique = next.filter((file) => {
      const key = fileKey(file);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    const checked = await Promise.all(
      unique.map(async (file) => ({
        file,
        result: await validateUploadFile(file),
      })),
    );
    const rejected = checked.filter((entry) => !entry.result.ok);
    const accepted = checked.filter(
      (entry) => entry.result.ok,
    ) as Array<{ file: File; result: { ok: true; contentType: string } }>;

    if (rejected.length > 0) {
      setUploadError(
        rejected
          .map(
            (entry) =>
              `${entry.file.name}: ${
                entry.result.ok ? '' : entry.result.message
              }`,
          )
          .join(' '),
      );
    }

    if (accepted.length > 0) {
      setUploadItems((items) => [
        ...items,
        ...accepted.map(({ file }) => ({
          id: `${fileKey(file)}:${crypto.randomUUID()}`,
          file,
          status: 'queued' as const,
          progress: 0,
        })),
      ]);
    }
  }

  async function startUpload(targets?: UploadItem[]) {
    const queue = (targets ?? uploadItems).filter(
      (item) => item.status === 'queued' || item.status === 'failed',
    );

    if (queue.length === 0 || uploading) {
      return;
    }

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploading(true);
    setUploadError(null);
    setUploadItems((items) =>
      items.map((item) =>
        queue.some((entry) => entry.id === item.id)
          ? { ...item, status: 'queued', progress: 0, error: undefined }
          : item,
      ),
    );

    let failures = 0;

    for (const item of queue) {
      if (controller.signal.aborted) {
        failures += 1;
        updateUploadItem(item.id, {
          status: 'failed',
          error: 'Upload cancelled.',
        });
        break;
      }

      updateUploadItem(item.id, {
        status: 'uploading',
        progress: 0,
        error: undefined,
      });

      const validation = await validateUploadFile(item.file);

      if (!validation.ok) {
        failures += 1;
        updateUploadItem(item.id, {
          status: 'failed',
          error: validation.message,
        });
        continue;
      }

      try {
        await uploadFileToDocument(
          organizationId,
          titleFromFileName(item.file.name),
          item.file,
          {
            contentType: validation.contentType,
            signal: controller.signal,
            onProgress: (fraction) =>
              updateUploadItem(item.id, { progress: fraction }),
          },
        );
        updateUploadItem(item.id, { status: 'completed', progress: 1 });
      } catch (error) {
        failures += 1;
        updateUploadItem(item.id, {
          status: 'failed',
          error: isAbortError(error) ? 'Upload cancelled.' : messageOf(error),
        });

        if (isAbortError(error)) {
          break;
        }
      }
    }

    uploadAbortRef.current = null;
    setUploading(false);
    await client.invalidateQueries({
      queryKey: queryKeys.organizations.documents.all(organizationId),
    });

    if (failures === 0) {
      toast({
        variant: 'success',
        title:
          queue.length === 1
            ? 'Document uploaded'
            : `${queue.length} documents uploaded`,
        description: 'They are queued for processing.',
      });
      setUploadItems([]);
      setUploadOpen(false);
      return;
    }

    setUploadItems((items) =>
      items.filter((item) => item.status !== 'completed'),
    );
    toast({
      variant: 'error',
      title: `${queue.length - failures} uploaded, ${failures} failed`,
      description: 'Fix or retry the failed files before closing.',
    });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    if (uploadItems.length === 0) {
      setValidationError('Choose at least one file to upload.');
      return;
    }

    await startUpload();
  }

  function handleUploadOpenChange(open: boolean) {
    if (uploading && !open) {
      return;
    }

    setUploadOpen(open);

    if (!open) {
      setUploadItems([]);
      setUploadError(null);
      setValidationError(null);
    }
  }

  const rename = useMutation({
    mutationFn: (input: { documentId: string; title: string }) =>
      documentsApi.rename(organizationId, input.documentId, {
        title: input.title,
      }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.all(organizationId),
      }),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) =>
      documentsApi.remove(organizationId, documentId),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.all(organizationId),
      }),
  });

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

  function resetFilters() {
    setQueryDraft('');
    setQuery('');
    setStatusFilter(ALL_STATUSES);
    setOrder('createdAt_desc');
  }

  return (
    <>
      <Dialog open={uploadOpen} onOpenChange={handleUploadOpenChange}>
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

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="Search documents by title or file name…"
                  aria-label="Search documents"
                  maxLength={200}
                  className="pr-9 pl-9"
                />
                {queryDraft.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQueryDraft('');
                      setQuery('');
                    }}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={order}
                onValueChange={(value) => setOrder(value as DocumentOrder)}
              >
                <SelectTrigger className="sm:w-40" aria-label="Sort documents">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt_desc">Newest first</SelectItem>
                  <SelectItem value="createdAt_asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button type="button" variant="ghost" onClick={resetFilters}>
                  Reset
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {documents.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : null}

          {!documents.isPending && !hasDocuments ? (
            hasFilters ? (
              <EmptyState
                icon={Search}
                title="No matching documents"
                description="Try a different search, status, or sort order."
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <FileText className="size-6" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-semibold">Get to your first answer</h2>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Upload a document, let KnowledgeHub process it, then ask
                      questions grounded in its contents.
                    </p>
                  </div>
                  <ol className="grid w-full max-w-lg gap-3 text-left sm:grid-cols-3">
                    <OnboardingStep number={1} title="Upload">
                      Add a PDF, text, or Markdown file.
                    </OnboardingStep>
                    <OnboardingStep number={2} title="Wait for Ready">
                      Processing extracts and embeds the text.
                    </OnboardingStep>
                    <OnboardingStep number={3} title="Ask">
                      Answers cite the passages they use.
                    </OnboardingStep>
                  </ol>
                  <DialogTrigger asChild>
                    <Button>
                      <Upload />
                      Upload your first document
                    </Button>
                  </DialogTrigger>
                </CardContent>
              </Card>
            )
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

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>
              Add PDF, plain text, or Markdown files up to{' '}
              {formatBytes(MAX_PROCESSABLE_UPLOAD_BYTES)} each. Titles are taken
              from file names and can be changed later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4" noValidate>
            {validationError ? (
              <ErrorNotice error={new Error(validationError)} />
            ) : null}
            {uploadError ? <ErrorNotice error={new Error(uploadError)} /> : null}

            <FileDropzone
              accept={ALLOWED_UPLOAD_CONTENT_TYPES.join(',')}
              files={uploadItems.map((item) => item.file)}
              disabled={uploading}
              onFilesAdd={(files) => void addFiles(files)}
            />

            {uploadItems.length > 0 ? (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {uploadItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={item.file.name}
                      >
                        {item.file.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                      </span>
                      {item.status === 'completed' ? (
                        <CircleCheck className="size-4 shrink-0 text-success" />
                      ) : null}
                      {item.status === 'failed' ? (
                        <TriangleAlert className="size-4 shrink-0 text-destructive" />
                      ) : null}
                      {item.status !== 'uploading' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={() =>
                            setUploadItems((items) =>
                              items.filter((entry) => entry.id !== item.id),
                            )
                          }
                        >
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>

                    {item.status === 'uploading' ? (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.round(item.progress * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Uploading… {Math.round(item.progress * 100)}%
                        </p>
                      </div>
                    ) : null}

                    {item.status === 'queued' ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Queued
                      </p>
                    ) : null}

                    {item.status === 'failed' && item.error ? (
                      <p className="mt-1 text-xs text-destructive">
                        {item.error}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <DialogFooter>
              {uploading ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => uploadAbortRef.current?.abort()}
                >
                  Cancel upload
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleUploadOpenChange(false)}
                >
                  Close
                </Button>
              )}
              <Button
                type="submit"
                disabled={
                  uploading ||
                  uploadItems.filter(
                    (item) =>
                      item.status === 'queued' || item.status === 'failed',
                  ).length === 0
                }
              >
                {uploading ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Uploading…
                  </>
                ) : uploadItems.some((item) => item.status === 'failed') ? (
                  'Retry failed'
                ) : (
                  `Upload ${uploadItems.length || ''}`.trim()
                )}
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

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The upload failed.';
}

function OnboardingStep({
  number,
  title,
  children,
}: Readonly<{
  number: number;
  title: string;
  children: ReactNode;
}>) {
  return (
    <li className="rounded-lg border p-3">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {number}
      </span>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
    </li>
  );
}

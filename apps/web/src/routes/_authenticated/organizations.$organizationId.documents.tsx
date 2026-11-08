import {
  documentContentTypeIcon,
  documentFailureMessage,
} from '~/lib/document-display';
import type {
  DocumentStatus,
  DocumentSummary,
} from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouterState, createFileRoute, Link } from '@tanstack/react-router';
import {
  CircleCheck,
  FileText,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CollectionBadges,
  CollectionsManager,
} from '~/components/collections-manager';
import { collectionsApi } from '~/lib/api/collections';
import { DocumentProgress } from '~/components/document-progress';
import { DocumentMultiSelect } from '~/components/document-multi-select';
import { DocumentStatusBadge } from '~/components/document-status-badge';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { FileDropzone } from '~/components/file-dropzone';
import { PageHeader } from '~/components/page-header';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
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
import { Progress } from '~/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { useToast } from '~/components/ui/toast';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { isValidImportUrl, urlImportErrorMessage } from '~/lib/url-import';
import { pollingInterval } from '~/lib/document-polling';
import { useTrackDocument } from '~/lib/document-notifications';
import { documentsApi, uploadFileToDocument } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { organizationsApi } from '~/lib/api/organizations';
import { formatBytes, formatDate } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { cn } from '~/lib/utils';
import {
  MAX_PROCESSABLE_UPLOAD_BYTES,
  titleFromFileName,
  uploadRejectionMessage,
  validateUploadFile,
} from '~/lib/upload-validation';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  documentTitleSchema,
} from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/documents',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('documents.pageTitle'),
      description: t('documents.pageDescription'),
    });
  },
  component: DocumentsPage,
});

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
  const t = useT();
  const trackDocument = useTrackDocument();
  const locale = useLocale();
  const { organizationId } = Route.useParams();
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const canWrite =
    organization.data?.organization.capabilities.includes('documents.write') ??
    false;
  const client = useQueryClient();
  const { toast } = useToast();
  const reportError = useReportError();
  const [importMode, setImportMode] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const hash = useRouterState({ select: (state) => state.location.hash });
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (hash === 'upload') {
      setUploadOpen(true);
      void navigate({ hash: '', replace: true });
    }
  }, [hash, navigate]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadCollectionIds, setUploadCollectionIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(
    null,
  );
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(
    null,
  );
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [collectionId, setCollectionId] = useState('all');
  const collections = useQuery({
    queryKey: queryKeys.organizations.collections(organizationId),
    queryFn: () => collectionsApi.list(organizationId),
  });
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
    ...(collectionId === 'all' ? {} : { collectionId }),
  };
  const hasFilters =
    collectionId !== 'all' ||
    query.length > 0 ||
    statusFilter !== ALL_STATUSES ||
    order !== 'createdAt_desc';

  const documents = useInfiniteQuery({
    queryKey: queryKeys.organizations.documents.list(organizationId, filters),
    queryFn: ({ pageParam }) =>
      documentsApi.list(organizationId, { cursor: pageParam, ...filters }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (query) => {
      return pollingInterval(
        query.state.data?.pages.flatMap((page) => page.documents) ?? [],
        typeof document !== 'undefined' &&
          document.visibilityState === 'visible',
      );
    },
  });
  useEffect(() => {
    for (const page of documents.data?.pages ?? []) {
      for (const item of page.documents) {
        if (item.status === 'PENDING' || item.status === 'PROCESSING') {
          trackDocument(item.id);
        }
      }
    }
  }, [documents.data, trackDocument]);
  useQueryErrorToast(documents.error, () => void documents.refetch());
  useQueryErrorToast(collections.error, () => void collections.refetch());

  function updateUploadItem(id: string, patch: Partial<UploadItem>) {
    setUploadItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function addFiles(next: File[]) {
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
    const accepted = checked.filter((entry) => entry.result.ok) as Array<{
      file: File;
      result: { ok: true; contentType: string };
    }>;

    if (rejected.length > 0) {
      reportError(
        new Error(
          rejected
            .map(
              (entry) =>
                `${entry.file.name}: ${
                  entry.result.ok
                    ? ''
                    : uploadRejectionMessage(entry.result.reason, t, locale)
                }`,
            )
            .join('\n'),
        ),
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
          error: t('documents.uploadCancelled'),
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
          error: uploadRejectionMessage(validation.reason, t, locale),
        });
        continue;
      }

      try {
        const uploaded = await uploadFileToDocument(
          organizationId,
          titleFromFileName(item.file.name, t('upload.untitled')),
          item.file,
          {
            contentType: validation.contentType,
            collectionIds: uploadCollectionIds,
            signal: controller.signal,
            onProgress: (fraction) =>
              updateUploadItem(item.id, { progress: fraction }),
          },
        );
        trackDocument(uploaded.document.id);
        updateUploadItem(item.id, { status: 'completed', progress: 1 });
      } catch (error) {
        failures += 1;
        updateUploadItem(item.id, {
          status: 'failed',
          error: isAbortError(error)
            ? t('documents.uploadCancelled')
            : messageOf(error, t),
        });

        if (isAbortError(error)) {
          break;
        }
      }
    }

    uploadAbortRef.current = null;
    setUploading(false);
    await Promise.all([
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.all(organizationId),
      }),
      client.invalidateQueries({
        queryKey: queryKeys.organizations.collections(organizationId),
      }),
    ]);

    if (failures === 0) {
      toast({
        variant: 'success',
        title: t('documents.uploaded', { count: queue.length }),
        description: t('documents.queuedForProcessing'),
      });
      setUploadItems([]);
      setUploadCollectionIds([]);
      setUploadOpen(false);
      return;
    }

    setUploadItems((items) =>
      items.filter((item) => item.status !== 'completed'),
    );
    toast({
      variant: 'error',
      title: t('documents.partialTitle', {
        uploaded: queue.length - failures,
        failed: failures,
      }),
      description: t('documents.partialDescription'),
    });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploadItems.length === 0) {
      reportError(new Error(t('documents.chooseFile')));
      return;
    }

    await startUpload();
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidImportUrl(importUrl)) {
      setImportError(t('documents.urlInvalid'));
      return;
    }
    if (importTitle.trim()) {
      const result = documentTitleSchema(t).safeParse({ title: importTitle });
      if (!result.success) {
        setImportError(
          result.error.issues[0]?.message ?? t('documents.urlImportFailed'),
        );
        return;
      }
    }
    setImporting(true);
    setImportError('');
    try {
      const result = await documentsApi.importFromUrl(organizationId, {
        url: importUrl,
        ...(importTitle.trim() ? { title: importTitle.trim() } : {}),
      });
      trackDocument(result.document.id);
      await client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(organizationId),
      });
      toast({ variant: 'success', title: t('documents.urlImportSuccess') });
      setImporting(false);
      handleUploadOpenChange(false);
    } catch (error) {
      setImportError(urlImportErrorMessage(error, t));
    } finally {
      setImporting(false);
    }
  }

  function handleUploadOpenChange(open: boolean) {
    if ((uploading || importing) && !open) {
      return;
    }

    setUploadOpen(open);

    if (open) {
      setUploadCollectionIds(collectionId === 'all' ? [] : [collectionId]);
      return;
    }

    setUploadItems([]);
    setUploadCollectionIds([]);
    setImportMode(false);
    setImportUrl('');
    setImportTitle('');
    setImportError('');
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
    onError: (error) => reportError(error),
  });

  const reprocess = useMutation({
    mutationFn: (documentId: string) =>
      documentsApi.reprocess(organizationId, documentId),
    onSuccess: () => {
      toast({
        variant: 'success',
        title: t('documents.reprocessing'),
        description: t('documents.reprocessingDescription'),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.all(organizationId),
      });
    },
    onError: (error) => reportError(error),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) =>
      documentsApi.remove(organizationId, documentId),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.all(organizationId),
      }),
    onError: (error) => reportError(error),
  });

  function openRename(document: DocumentSummary) {
    setRenameTarget(document);
    setRenameTitle(document.title);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) {
      return;
    }

    const result = documentTitleSchema(t).safeParse({ title: renameTitle });
    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.invalidInput'),
        ),
      );
      return;
    }

    try {
      await rename.mutateAsync({
        documentId: renameTarget.id,
        title: result.data.title,
      });
      toast({ variant: 'success', title: t('documents.renamed') });
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
        title: t('documents.deleted'),
        description: t('documents.deletedDescription', {
          title: deleteTarget.title,
        }),
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
    setCollectionId('all');
  }

  return (
    <>
      <Dialog open={uploadOpen} onOpenChange={handleUploadOpenChange}>
        <div className="space-y-8">
          <PageHeader
            title={t('nav.documents')}
            description={t('documents.description')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {canWrite ? (
                  <CollectionsManager
                    organizationId={organizationId}
                    collections={collections.data ?? []}
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('documents.refresh')}
                  onClick={() => void documents.refetch()}
                  disabled={documents.isFetching}
                >
                  <RefreshCw
                    className={cn(documents.isFetching && 'animate-spin')}
                  />
                </Button>
                {canWrite ? (
                  <DialogTrigger asChild>
                    <Button>
                      <Upload />
                      {t('documents.uploadDocument')}
                    </Button>
                  </DialogTrigger>
                ) : null}
              </div>
            }
          />

          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder={t('documents.searchPlaceholder')}
                  aria-label={t('documents.searchLabel')}
                  maxLength={200}
                  className="pr-12 pl-9 sm:pr-9"
                />
                {queryDraft.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setQueryDraft('');
                      setQuery('');
                    }}
                    aria-label={t('documents.clearSearch')}
                    className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 sm:size-8 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger
                  className="w-full sm:w-52 sm:shrink-0"
                  aria-label={t('documents.filterCollection')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('documents.allCollections')}
                  </SelectItem>
                  {(collections.data ?? []).map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      {collection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              >
                <SelectTrigger
                  className="w-full sm:w-44 sm:shrink-0"
                  aria-label={t('documents.filterStatus')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>
                    {t('documents.allStatuses')}
                  </SelectItem>
                  <SelectItem value="READY">
                    {t('documentStatus.READY')}
                  </SelectItem>
                  <SelectItem value="PROCESSING">
                    {t('documentStatus.PROCESSING')}
                  </SelectItem>
                  <SelectItem value="PENDING">
                    {t('documentStatus.PENDING')}
                  </SelectItem>
                  <SelectItem value="FAILED">
                    {t('documentStatus.FAILED')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={order}
                onValueChange={(value) => setOrder(value as DocumentOrder)}
              >
                <SelectTrigger
                  className="w-full sm:w-52 sm:shrink-0"
                  aria-label={t('documents.sort')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt_desc">
                    {t('documents.newestFirst')}
                  </SelectItem>
                  <SelectItem value="createdAt_asc">
                    {t('documents.oldestFirst')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button type="button" variant="ghost" onClick={resetFilters}>
                  {t('documents.reset')}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {collections.isError ? (
            <RouteError
              title={t('documents.collectionsLoadError')}
              onRetry={() => void collections.refetch()}
            />
          ) : null}

          {documents.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : null}

          {documents.isError ? (
            <RouteError
              title={t('documents.loadError')}
              onRetry={() => void documents.refetch()}
            />
          ) : null}

          {documents.isSuccess && !hasDocuments ? (
            hasFilters ? (
              <EmptyState
                icon={Search}
                title={t('documents.noMatchingTitle')}
                description={t('documents.noMatchingDescription')}
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    {t('documents.resetFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FileText}
                title={t('documents.noDocumentsTitle')}
                description={
                  canWrite
                    ? t('documents.noDocumentsWrite')
                    : t('documents.noDocumentsRead')
                }
                action={
                  canWrite ? (
                    <DialogTrigger asChild>
                      <Button>
                        <Upload />
                        {t('documents.uploadFirst')}
                      </Button>
                    </DialogTrigger>
                  ) : undefined
                }
              />
            )
          ) : null}

          {hasDocuments ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {rows.map((document) => {
                      const DocumentIcon = documentContentTypeIcon(
                        document.contentType,
                      );
                      return (
                        <li
                          key={document.id}
                          className="flex items-start gap-2 px-4 py-4 sm:items-center sm:gap-4 sm:px-6"
                        >
                          <Link
                            to="/organizations/$organizationId/documents/$documentId"
                            params={{ organizationId, documentId: document.id }}
                            className="flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:items-center sm:gap-4"
                          >
                            <span
                              className={cn(
                                'flex size-10 shrink-0 items-center justify-center rounded-md',
                                document.status === 'READY'
                                  ? 'bg-brand/10 text-brand'
                                  : 'bg-muted text-muted-foreground',
                              )}
                            >
                              <DocumentIcon className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <span
                                className="block text-sm font-medium break-words line-clamp-2 sm:line-clamp-1"
                                title={document.title}
                              >
                                {document.title}
                              </span>
                              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <DocumentStatusBadge status={document.status} />
                                <span
                                  className="min-w-0 truncate text-xs text-muted-foreground"
                                  title={document.originalFileName ?? undefined}
                                >
                                  {document.originalFileName ??
                                    t('documents.uploadPending')}
                                  {document.sizeBytes !== null
                                    ? ` · ${formatBytes(document.sizeBytes, locale)}`
                                    : ''}
                                  {` · ${formatDate(document.createdAt, locale)}`}
                                </span>
                              </span>
                              <CollectionBadges
                                collections={document.collections ?? []}
                              />
                              <DocumentProgress document={document} />
                              {document.status === 'FAILED' ? (
                                <span className="mt-1 block text-xs break-words text-destructive">
                                  {document.failureKind === 'VERIFICATION'
                                    ? t('documents.verificationFailed')
                                    : t('documents.processingFailed')}
                                  {document.failureReason
                                    ? `: ${documentFailureMessage(document.failureReason, t)}`
                                    : ''}
                                </span>
                              ) : null}
                            </div>
                          </Link>
                          {canWrite ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t('documents.actionsFor', {
                                    title: document.title,
                                  })}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {document.status === 'FAILED' ? (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      reprocess.mutate(document.id)
                                    }
                                    disabled={reprocess.isPending}
                                  >
                                    <RotateCcw />
                                    {t('documents.retryProcessing')}
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  onSelect={() => openRename(document)}
                                >
                                  <Pencil />
                                  {t('documents.rename')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setDeleteTarget(document)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 />
                                  {t('documents.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </li>
                      );
                    })}
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
                    {documents.isFetchingNextPage ? <Spinner /> : null}
                    {t('orgSettings.loadMore')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('documents.uploadTitle')}</DialogTitle>
            <DialogDescription>
              {t('documents.uploadDescription', {
                size: formatBytes(MAX_PROCESSABLE_UPLOAD_BYTES, locale),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={importMode ? 'outline' : 'default'}
              disabled={uploading || importing}
              onClick={() => setImportMode(false)}
            >
              {t('documents.uploadFile')}
            </Button>
            <Button
              type="button"
              variant={importMode ? 'default' : 'outline'}
              disabled={uploading || importing}
              onClick={() => setImportMode(true)}
            >
              {t('documents.importUrl')}
            </Button>
          </div>
          {importMode ? (
            <form onSubmit={handleImport} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="import-url">{t('documents.urlLabel')}</Label>
                <Input
                  id="import-url"
                  type="url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  disabled={importing}
                  aria-invalid={!!importError}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-title">{t('documents.urlTitle')}</Label>
                <Input
                  id="import-title"
                  value={importTitle}
                  onChange={(event) => setImportTitle(event.target.value)}
                  disabled={importing}
                />
              </div>
              {importError ? (
                <p role="alert" className="text-sm text-destructive">
                  {importError}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={importing}
                  onClick={() => handleUploadOpenChange(false)}
                >
                  {t('documents.close')}
                </Button>
                <Button type="submit" disabled={importing || !canWrite}>
                  {importing ? (
                    <>
                      <Spinner />
                      {t('documents.urlImporting')}
                    </>
                  ) : (
                    t('documents.importUrl')
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleUpload} className="space-y-4" noValidate>
              <FileDropzone
                accept={[
                  ...ALLOWED_UPLOAD_CONTENT_TYPES,
                  '.pdf',
                  '.docx',
                  '.pptx',
                  '.xlsx',
                  '.html',
                  '.htm',
                  '.txt',
                  '.text',
                  '.md',
                  '.markdown',
                ].join(',')}
                files={uploadItems.map((item) => item.file)}
                disabled={uploading || !canWrite}
                onFilesAdd={(files) => void addFiles(files)}
              />

              <DocumentMultiSelect
                disabled={uploading}
                label={t('documents.uploadCollections')}
                emptyLabel={t('documents.uploadNoCollection')}
                documents={(collections.data ?? []).map((collection) => ({
                  id: collection.id,
                  title: collection.name,
                }))}
                selectedIds={uploadCollectionIds}
                onChange={setUploadCollectionIds}
              />

              {uploadItems.length > 0 ? (
                <ul className="max-h-40 space-y-2 overflow-y-auto sm:max-h-56">
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
                          {formatBytes(item.file.size, locale)}
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
                            className="size-10 sm:size-7"
                            aria-label={t('documents.removeFile', {
                              name: item.file.name,
                            })}
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
                          <Progress
                            value={Math.round(item.progress * 100)}
                            className="h-1.5"
                            aria-label={t('documents.uploadingFile', {
                              name: item.file.name,
                            })}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('documents.uploadingPercent', {
                              percent: Math.round(item.progress * 100),
                            })}
                          </p>
                        </div>
                      ) : null}

                      {item.status === 'queued' ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('documents.queued')}
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
                    {t('documents.cancelUpload')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUploadOpenChange(false)}
                  >
                    {t('documents.close')}
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
                      <Spinner />
                      {t('documents.uploading')}
                    </>
                  ) : uploadItems.some((item) => item.status === 'failed') ? (
                    t('documents.retryFailed')
                  ) : (
                    t('documents.uploadCount', { count: uploadItems.length })
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
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
            <DialogTitle>{t('documents.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('documents.renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="rename-title">{t('documents.titleLabel')}</Label>
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
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteDescription', {
                title: deleteTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={remove.isPending}
            >
              {remove.isPending
                ? t('documents.deleting')
                : t('documents.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function messageOf(error: unknown, t: ReturnType<typeof useT>): string {
  return error instanceof Error ? error.message : t('documents.uploadFailed');
}

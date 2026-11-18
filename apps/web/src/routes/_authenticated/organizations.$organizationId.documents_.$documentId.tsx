import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Download,
  Eye,
  History,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { ContractTotalsCard } from '~/components/contract-totals-card';
import { DocumentCollections } from '~/components/document-collections';
import {
  DocumentDetailRow,
  DocumentDetailSection,
} from '~/components/document-detail-section';
import { DocumentProgress } from '~/components/document-progress';
import {
  DocumentReviewBadge,
  DocumentReviewEditor,
} from '~/components/document-review';
import { DocumentStatusBadge } from '~/components/document-status-badge';
import { DocumentVersions } from '~/components/document-versions';
import { DocumentViewer } from '~/components/document-viewer';
import { RefreshDocumentSource } from '~/components/refresh-document-source';
import { RouteError } from '~/components/route-states';
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
import { Button, buttonVariants } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { documentsApi } from '~/lib/api/documents';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import {
  canPreviewDocument,
  documentContentTypeIcon,
  documentContentTypeLabel,
  documentFailureGuidance,
} from '~/lib/document-display';
import { useTrackDocument } from '~/lib/document-notifications';
import { pollingInterval } from '~/lib/document-polling';
import { formatBytes, formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { documentTitleSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/documents_/$documentId',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('documentDetail.pageTitle'),
      description: t('documentDetail.pageDescription'),
    });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { page?: number; quote?: string; generation?: number } => {
    const generation = Number(search.generation);
    const raw = search.page;
    const page =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : Number.NaN;

    const quote =
      typeof search.quote === 'string' && search.quote.trim().length > 0
        ? search.quote
        : undefined;

    return {
      ...(Number.isInteger(page) && page > 0 ? { page } : {}),
      ...(quote ? { quote } : {}),
      ...(Number.isSafeInteger(generation) && generation > 0
        ? { generation }
        : {}),
    };
  },
  component: DocumentDetailPage,
});

const ACTIVE_STATUSES = new Set(['PENDING', 'PROCESSING']);

function DocumentDetailPage() {
  const t = useT();
  const trackDocument = useTrackDocument();
  const locale = useLocale();
  const { organizationId, documentId } = Route.useParams();
  const organization = useQuery({
    queryKey: queryKeys.organizations.detail(organizationId),
    queryFn: () => organizationsApi.detail(organizationId),
  });
  const capabilities = organization.data?.organization.capabilities ?? [];
  const canWrite = capabilities.includes('documents.write');
  const canDelete = capabilities.includes('documents.delete');
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportError = useReportError();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const document = useQuery({
    queryKey: queryKeys.organizations.documents.detail(
      organizationId,
      documentId,
    ),
    queryFn: () => documentsApi.detail(organizationId, documentId),
    refetchInterval: (query) => {
      return pollingInterval(
        query.state.data ? [query.state.data.document] : [],
        typeof window !== 'undefined' &&
          window.document.visibilityState === 'visible',
      );
    },
  });
  useEffect(() => {
    if (document.data && ACTIVE_STATUSES.has(document.data.document.status)) {
      trackDocument(document.data.document.id);
    }
  }, [document.data, trackDocument]);
  useQueryErrorToast(document.error, () => void document.refetch());

  const { page, quote, generation } = Route.useSearch();
  const versions = useQuery({
    queryKey: [
      'document-versions',
      organizationId,
      documentId,
      document.data?.document.generation,
    ],
    queryFn: () => documentsApi.versions(organizationId, documentId),
  });
  useQueryErrorToast(versions.error, () => void versions.refetch());
  const selectedVersion = versions.data?.versions.find(
    (version) => version.generation === generation,
  );
  const previewContentType =
    selectedVersion?.contentType ?? document.data?.document.contentType ?? null;
  const originalAvailable =
    document.data !== undefined &&
    document.data.document.status !== 'PENDING' &&
    document.data.document.failureKind !== 'VERIFICATION';

  const download = useQuery({
    queryKey: [
      ...queryKeys.organizations.documents.download(organizationId, documentId),
      generation ?? document.data?.document.generation,
    ],
    queryFn: () =>
      documentsApi.downloadUrl(organizationId, documentId, generation),
    enabled: originalAvailable,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  async function openOriginal(
    event: MouseEvent<HTMLAnchorElement>,
  ): Promise<void> {
    const current = download.data;

    if (
      current === undefined ||
      Date.parse(current.expiresAt) - Date.now() > 60_000
    ) {
      return;
    }

    event.preventDefault();

    const tab = window.open('about:blank', '_blank');

    if (tab !== null) {
      tab.opener = null;
    }

    const refreshed = await download.refetch();

    if (refreshed.isError || refreshed.data === undefined) {
      tab?.close();
      return;
    }

    const url = withPage(refreshed.data.url, page);

    if (tab !== null) {
      tab.location.replace(url);
      return;
    }

    window.location.assign(url);
  }

  const rename = useMutation({
    mutationFn: (title: string) =>
      documentsApi.rename(organizationId, documentId, { title }),
    onSuccess: () => {
      toast({ variant: 'success', title: t('documents.renamed') });
      setRenameOpen(false);

      return Promise.all([
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.detail(
            organizationId,
            documentId,
          ),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.organizations.documents.list(organizationId),
        }),
      ]);
    },
    onError: (error) => reportError(error),
  });

  const reprocess = useMutation({
    mutationFn: () => documentsApi.reprocess(organizationId, documentId),
    onSuccess: () => {
      toast({
        variant: 'success',
        title: t('documents.reprocessing'),
        description: t('documentDetail.reprocessingDescription'),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.detail(
          organizationId,
          documentId,
        ),
      });
    },
    onError: (error) => reportError(error),
  });

  const remove = useMutation({
    mutationFn: () => documentsApi.remove(organizationId, documentId),
    onSuccess: async () => {
      toast({
        variant: 'success',
        title: t('documents.deleted'),
        description: t('documentDetail.deletedDescription'),
      });
      await client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(organizationId),
      });
      await navigate({
        to: '/organizations/$organizationId/documents',
        params: { organizationId },
      });
    },
    onError: (error) => reportError(error),
  });

  function openRename() {
    const title = document.data?.document.title;

    if (title === undefined) {
      return;
    }

    setRenameTitle(title);
    setRenameOpen(true);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = documentTitleSchema(t).safeParse({ title: renameTitle });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.titleRequired'),
        ),
      );
      return;
    }

    try {
      await rename.mutateAsync(result.data.title);
    } catch {
      return;
    }
  }

  if (document.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[32rem] w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (document.isError) {
    return (
      <div className="space-y-6">
        <BackLink organizationId={organizationId} />
        <RouteError
          title={t('documentDetail.loadError')}
          onRetry={() => void document.refetch()}
        />
      </div>
    );
  }

  const entry = document.data.document;
  const TypeIcon = documentContentTypeIcon(entry.contentType);
  const isReady = entry.status === 'READY';
  const failure =
    entry.status === 'FAILED'
      ? documentFailureGuidance(entry.failureReason, t)
      : null;
  const viewingOlderVersion =
    generation !== undefined &&
    entry.generation !== undefined &&
    generation < entry.generation;
  const previewable = canPreviewDocument(previewContentType);
  const metadata = [
    documentContentTypeLabel(entry.contentType, t),
    entry.sizeBytes === null ? null : formatBytes(entry.sizeBytes, locale),
    entry.generation === undefined
      ? null
      : t('documentVersions.version', { generation: entry.generation }),
  ].filter((item): item is string => item !== null);

  return (
    <div className="space-y-6">
      <BackLink organizationId={organizationId} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 sm:flex">
            <TypeIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {entry.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <DocumentStatusBadge status={entry.status} />
              <DocumentReviewBadge review={entry.review} />
              {metadata.map((item, index) => (
                <span key={item} className="flex items-center gap-3">
                  {index > 0 ? (
                    <span aria-hidden className="text-border">
                      •
                    </span>
                  ) : null}
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          {isReady ? (
            <Button asChild>
              <Link
                to="/organizations/$organizationId/ask"
                params={{ organizationId }}
                search={{ documentId }}
              >
                <MessageSquare />
                {t('search.askAboutDocument')}
              </Link>
            </Button>
          ) : null}
          {download.data ? (
            <Button variant="outline" asChild>
              <a
                href={withPage(download.data.url, page)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => void openOriginal(event)}
              >
                <Download />
                {t('documentDetail.downloadOriginal')}
              </a>
            </Button>
          ) : null}
          {canWrite || canDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('documentDetail.moreActions')}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canWrite ? (
                  <DropdownMenuItem onSelect={openRename}>
                    <Pencil />
                    {t('documents.rename')}
                  </DropdownMenuItem>
                ) : null}
                {canWrite && canDelete ? <DropdownMenuSeparator /> : null}
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    <Trash2 />
                    {t('documents.delete')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          {failure ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-destructive">{failure.title}</p>
                <p className="text-sm text-muted-foreground">
                  {failure.description}
                </p>
                {entry.failureReason ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {t('documentDetail.failureCode', {
                      code: entry.failureReason,
                    })}
                  </p>
                ) : null}
                {canWrite || canDelete ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {canWrite ? (
                      <>
                        <Button
                          size="sm"
                          variant={
                            failure.action === 'reprocess'
                              ? 'default'
                              : 'outline'
                          }
                          onClick={() => reprocess.mutate()}
                          disabled={reprocess.isPending}
                        >
                          <RotateCcw />
                          {t('documentDetail.reprocess')}
                        </Button>
                        <Link
                          className={buttonVariants({
                            variant:
                              failure.action === 'replace'
                                ? 'default'
                                : 'outline',
                            size: 'sm',
                          })}
                          to="/organizations/$organizationId/documents"
                          params={{ organizationId }}
                          hash="upload"
                        >
                          {t('documentDetail.uploadAgain')}
                        </Link>
                      </>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        {t('documents.delete')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {ACTIVE_STATUSES.has(entry.status) ? (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">
                {t('documentDetail.processingTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('documentDetail.refreshing')}
              </p>
              <DocumentProgress document={entry} detailed />
            </div>
          ) : null}

          {viewingOlderVersion ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-center gap-2">
                <History className="size-4 shrink-0 text-info" />
                {t('documentVersions.outdated', { generation })}
              </p>
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                to="/organizations/$organizationId/documents/$documentId"
                params={{ organizationId, documentId }}
              >
                {t('documentDetail.viewCurrent')}
              </Link>
            </div>
          ) : null}

          {originalAvailable && download.isError ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              {t('documentDetail.originalUnavailable')}{' '}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={() => void download.refetch()}
              >
                {t('common.tryAgain')}
              </button>
            </p>
          ) : null}

          {download.data && previewable ? (
            <DocumentViewer
              key={download.dataUpdatedAt}
              url={download.data.url}
              contentType={previewContentType}
              page={page}
              quote={quote}
              onRetry={() => void download.refetch()}
            />
          ) : null}

          {download.data && !previewable ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Eye className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">
                  {t('documentDetail.noPreview', {
                    type: documentContentTypeLabel(previewContentType, t),
                  })}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t('documentDetail.noPreviewHint')}
                </p>
              </div>
            </div>
          ) : null}

          {isReady ? (
            <ContractTotalsCard
              organizationId={organizationId}
              documentId={documentId}
            />
          ) : null}
        </div>

        <aside className="divide-y rounded-xl border bg-card">
          <DocumentDetailSection title={t('documentDetail.details')}>
            <dl className="space-y-2">
              <DocumentDetailRow label={t('documentDetail.originalFile')}>
                <span title={entry.originalFileName ?? undefined}>
                  {entry.originalFileName ?? t('documents.uploadPending')}
                </span>
              </DocumentDetailRow>
              <DocumentDetailRow label={t('documentDetail.contentType')}>
                {documentContentTypeLabel(entry.contentType, t)}
              </DocumentDetailRow>
              <DocumentDetailRow label={t('documentDetail.size')}>
                {entry.sizeBytes === null
                  ? '—'
                  : formatBytes(entry.sizeBytes, locale)}
              </DocumentDetailRow>
              <DocumentDetailRow label={t('documentDetail.uploaded')}>
                {formatDateTime(entry.createdAt, locale)}
              </DocumentDetailRow>
              <DocumentDetailRow label={t('documentDetail.lastUpdated')}>
                {formatDateTime(entry.updatedAt, locale)}
              </DocumentDetailRow>
            </dl>
          </DocumentDetailSection>
          <DocumentCollections
            organizationId={organizationId}
            document={entry}
            canWrite={canWrite}
          />
          {entry.sourceUrl ? (
            <RefreshDocumentSource
              organizationId={organizationId}
              documentId={documentId}
              sourceUrl={entry.sourceUrl}
              checkedAt={entry.sourceCheckedAt}
              canRefresh={canWrite && isReady}
            />
          ) : null}
          <DocumentReviewEditor
            key={`${entry.id}-${entry.updatedAt}`}
            organizationId={organizationId}
            document={entry}
            canWrite={canWrite}
          />
          <DocumentVersions
            organizationId={organizationId}
            documentId={documentId}
            generation={generation}
            currentGeneration={entry.generation}
            versions={versions.data?.versions ?? []}
            canReplace={canWrite && isReady}
          />
        </aside>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('documents.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('documents.renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="detail-rename-title">
                {t('documents.titleLabel')}
              </Label>
              <Input
                id="detail-rename-title"
                autoFocus
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteDescription', { title: entry.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(event) => {
                event.preventDefault();
                void remove.mutateAsync();
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
    </div>
  );
}

function BackLink({ organizationId }: Readonly<{ organizationId: string }>) {
  const t = useT();

  return (
    <Link
      to="/organizations/$organizationId/documents"
      params={{ organizationId }}
      className="inline-flex items-center gap-1 py-2 -my-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('ask.allDocuments')}
    </Link>
  );
}

function withPage(url: string, page?: number): string {
  return page === undefined ? url : `${url}#page=${page}`;
}

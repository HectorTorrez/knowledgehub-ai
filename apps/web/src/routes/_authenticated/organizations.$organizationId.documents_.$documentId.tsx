import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileText,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ContractTotalsCard } from '~/components/contract-totals-card';
import { DocumentStatusBadge } from '~/components/document-status-badge';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { documentsApi } from '~/lib/api/documents';
import { queryKeys } from '~/lib/api/query-keys';
import { formatBytes, formatDateTime } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { documentTitleSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/documents_/$documentId',
)({
  head: () =>
    pageHead({
      title: 'Document · KnowledgeHub AI',
      description:
        'Inspect a document, its processing status, and the file it was uploaded from.',
    }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { page?: number } => {
    const raw = search.page;
    const page =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : Number.NaN;

    return Number.isInteger(page) && page > 0 ? { page } : {};
  },
  component: DocumentDetailPage,
});

const ACTIVE_STATUSES = new Set(['PENDING', 'PROCESSING']);

function DocumentDetailPage() {
  const { organizationId, documentId } = Route.useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const document = useQuery({
    queryKey: queryKeys.organizations.documents.detail(organizationId, documentId),
    queryFn: () => documentsApi.detail(organizationId, documentId),
    refetchInterval: (query) => {
      const data = query.state.data;

      return data && ACTIVE_STATUSES.has(data.document.status) ? 3000 : false;
    },
  });

  const { page } = Route.useSearch();
  const originalAvailable =
    document.data !== undefined &&
    document.data.document.status !== 'PENDING' &&
    document.data.document.failureKind !== 'VERIFICATION';

  const download = useQuery({
    queryKey: queryKeys.organizations.documents.download(
      organizationId,
      documentId,
    ),
    queryFn: () => documentsApi.downloadUrl(organizationId, documentId),
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
      toast({ variant: 'success', title: 'Document renamed' });
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
  });

  const reprocess = useMutation({
    mutationFn: () => documentsApi.reprocess(organizationId, documentId),
    onSuccess: () => {
      toast({
        variant: 'success',
        title: 'Reprocessing started',
        description: 'This page will refresh when the document moves forward.',
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.detail(
          organizationId,
          documentId,
        ),
      });
    },
  });

  const remove = useMutation({
    mutationFn: () => documentsApi.remove(organizationId, documentId),
    onSuccess: async () => {
      toast({
        variant: 'success',
        title: 'Document deleted',
        description: 'The document and everything derived from it were removed.',
      });
      await client.invalidateQueries({
        queryKey: queryKeys.organizations.documents.list(organizationId),
      });
      await navigate({
        to: '/organizations/$organizationId/documents',
        params: { organizationId },
      });
    },
  });

  function openRename() {
    const title = document.data?.document.title;

    if (title === undefined) {
      return;
    }

    setRenameTitle(title);
    setRenameError(null);
    setRenameOpen(true);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRenameError(null);

    const result = documentTitleSchema.safeParse({ title: renameTitle });

    if (!result.success) {
      setRenameError(result.error.issues[0]?.message ?? 'A title is required.');
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
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (document.isError) {
    return (
      <div className="space-y-6">
        <BackLink organizationId={organizationId} />
        <ErrorNotice
          error={document.error}
          onRetry={() => void document.refetch()}
        />
      </div>
    );
  }

  const entry = document.data.document;

  return (
    <div className="space-y-6">
      <BackLink organizationId={organizationId} />

      <PageHeader
        title={entry.title}
        description="The file, processing state, and metadata behind this document."
        eyebrow={<DocumentStatusBadge status={entry.status} />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {download.data ? (
              <Button variant="outline" asChild>
                <a
                  href={withPage(download.data.url, page)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => void openOriginal(event)}
                >
                  <ExternalLink />
                  {page === undefined ? 'Open original' : `Open page ${page}`}
                </a>
              </Button>
            ) : null}
            {entry.status === 'FAILED' ? (
              <Button
                variant="outline"
                disabled={reprocess.isPending}
                onClick={() => reprocess.mutate()}
              >
                <RotateCcw />
                {reprocess.isPending ? 'Retrying…' : 'Retry processing'}
              </Button>
            ) : null}
            <Button variant="outline" onClick={openRename}>
              <Pencil />
              Rename
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              Delete
            </Button>
          </div>
        }
      />

      {originalAvailable && download.isError ? (
        <p className="text-sm text-muted-foreground">
          The original file is not available right now.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => void download.refetch()}
          >
            Try again
          </button>
        </p>
      ) : null}

      {page !== undefined && originalAvailable ? (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Page {page}</p>
            <p className="text-sm text-muted-foreground">
              {download.data
                ? `Open page ${page} in the original file to check the passage it came from.`
                : download.isError
                  ? 'The original file is not available right now.'
                  : 'The original file is loading.'}
            </p>
          </div>
        </div>
      ) : null}

      {reprocess.isError ? <ErrorNotice error={reprocess.error} /> : null}

      {entry.status === 'FAILED' ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            {entry.failureKind === 'VERIFICATION'
              ? 'Upload verification failed'
              : 'Processing failed'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {entry.failureReason ??
              'No failure details were recorded. Delete this document and upload it again.'}
          </p>
        </div>
      ) : null}

      {ACTIVE_STATUSES.has(entry.status) ? (
        <p className="text-sm text-muted-foreground" role="status">
          This page refreshes automatically while the document is being
          processed.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Status">
              <DocumentStatusBadge status={entry.status} />
            </DetailItem>
            <DetailItem label="Original file">
              {entry.originalFileName ?? 'Upload pending'}
            </DetailItem>
            <DetailItem label="Content type">
              {entry.contentType ?? '—'}
            </DetailItem>
            <DetailItem label="Size">
              {entry.sizeBytes === null ? '—' : formatBytes(entry.sizeBytes)}
            </DetailItem>
            <DetailItem label="Uploaded">
              {formatDateTime(entry.createdAt)}
            </DetailItem>
            <DetailItem label="Last updated">
              {formatDateTime(entry.updatedAt)}
            </DetailItem>
          </dl>
        </CardContent>
      </Card>

      {entry.status === 'READY' ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Use this document in answers</p>
              <p className="text-sm text-muted-foreground">
                Ask a question and narrow the scope to this document.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link
                to="/organizations/$organizationId/ask"
                params={{ organizationId }}
              >
                Ask about this document
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {entry.status === 'READY' ? (
        <ContractTotalsCard
          organizationId={organizationId}
          documentId={documentId}
        />
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
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
              <Label htmlFor="detail-rename-title">Title</Label>
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
                Cancel
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              This permanently removes “{entry.title}” and everything derived
              from it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError ? <ErrorNotice error={remove.error} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove.mutateAsync()}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink({ organizationId }: Readonly<{ organizationId: string }>) {
  return (
    <Link
      to="/organizations/$organizationId/documents"
      params={{ organizationId }}
      className="inline-flex items-center gap-1 py-2 -my-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      All documents
    </Link>
  );
}

function withPage(url: string, page?: number): string {
  return page === undefined ? url : `${url}#page=${page}`;
}

function DetailItem({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

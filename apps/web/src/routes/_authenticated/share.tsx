import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FileText, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '~/components/empty-state';
import { PageHeader } from '~/components/page-header';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
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
import { Spinner } from '~/components/ui/spinner';
import { useToast } from '~/components/ui/toast';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
import { documentsApi, uploadFileToDocument } from '~/lib/api/documents';
import { organizationsApi } from '~/lib/api/organizations';
import { queryKeys } from '~/lib/api/query-keys';
import { useTrackDocument } from '~/lib/document-notifications';
import { formatBytes } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import {
  clearSharedPayload,
  readSharedPayload,
  type SharedPayload,
} from '~/lib/share-target';
import { titleFromFileName, validateUploadFile } from '~/lib/upload-validation';

export const Route = createFileRoute('/_authenticated/share')({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({ title: t('shareTarget.pageTitle') });
  },
  component: SharePage,
});

function SharePage() {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { toast } = useToast();
  const trackDocument = useTrackDocument();
  const [payload, setPayload] = useState<SharedPayload | null | undefined>(
    undefined,
  );
  const [organizationId, setOrganizationId] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const organizations = useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () => organizationsApi.list(),
  });
  useQueryErrorToast(organizations.error, () => void organizations.refetch());
  const writable = (organizations.data?.organizations ?? []).filter((org) =>
    org.capabilities.includes('documents.write'),
  );

  useEffect(() => {
    void readSharedPayload()
      .catch(() => null)
      .then((shared) => {
        setPayload(shared);
        setTitle(shared?.title ?? '');
      });
  }, []);

  useEffect(() => {
    if (organizationId === '' && writable.length > 0) {
      setOrganizationId(writable[0]!.id);
    }
  }, [organizationId, writable]);

  async function discard() {
    await clearSharedPayload();
    void navigate({ to: '/organizations' });
  }

  async function add() {
    if (payload === null || payload === undefined || organizationId === '') {
      return;
    }

    setAdding(true);
    let added = 0;
    let failed = 0;

    if (payload.url !== null) {
      try {
        const result = await documentsApi.importFromUrl(organizationId, {
          url: payload.url,
          ...(title.trim() && payload.files.length === 0
            ? { title: title.trim() }
            : {}),
        });
        trackDocument(result.document.id);
        added += 1;
      } catch {
        failed += 1;
      }
    }

    for (const file of payload.files) {
      const validation = await validateUploadFile(file);

      if (!validation.ok) {
        failed += 1;
        continue;
      }

      try {
        const uploaded = await uploadFileToDocument(
          organizationId,
          title.trim() && payload.files.length === 1 && payload.url === null
            ? title.trim()
            : titleFromFileName(file.name, t('upload.untitled')),
          file,
          { contentType: validation.contentType },
        );
        trackDocument(uploaded.document.id);
        added += 1;
      } catch {
        failed += 1;
      }
    }

    setAdding(false);
    await client.invalidateQueries({
      queryKey: queryKeys.organizations.documents.all(organizationId),
    });

    if (added > 0) {
      toast({
        variant: 'success',
        title: t('shareTarget.added', { count: added }),
      });
    }

    if (failed > 0) {
      toast({ variant: 'error', title: t('shareTarget.someFailed') });
      return;
    }

    await clearSharedPayload();
    void navigate({
      to: '/organizations/$organizationId/documents',
      params: { organizationId },
    });
  }

  if (payload === undefined) {
    return (
      <div className="mx-auto max-w-xl space-y-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">
          {t('shareTarget.loading')}
        </p>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (
    payload === null ||
    (payload.url === null && payload.files.length === 0)
  ) {
    return (
      <EmptyState
        icon={Share2}
        title={t('shareTarget.emptyTitle')}
        description={t('shareTarget.emptyDescription')}
        action={
          <Button asChild variant="outline">
            <Link to="/organizations">
              {t('shareTarget.goToOrganizations')}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={t('shareTarget.title')}
        description={t('shareTarget.description')}
      />

      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          {payload.url !== null ? (
            <section className="space-y-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('shareTarget.link')}
              </h2>
              <p className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{payload.url}</span>
              </p>
            </section>
          ) : null}

          {payload.files.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('shareTarget.files')}
              </h2>
              <ul className="divide-y rounded-lg border">
                {payload.files.map((file) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(file.size, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {payload.files.length + (payload.url === null ? 0 : 1) === 1 ? (
            <div className="space-y-2">
              <Label htmlFor="share-title">{t('shareTarget.titleLabel')}</Label>
              <Input
                id="share-title"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                disabled={adding}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="share-organization">
              {t('shareTarget.organization')}
            </Label>
            {organizations.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : writable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('shareTarget.noWritableOrganizations')}
              </p>
            ) : (
              <Select
                value={organizationId}
                onValueChange={setOrganizationId}
                disabled={adding}
              >
                <SelectTrigger id="share-organization" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {writable.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={adding}
              onClick={() => void discard()}
            >
              {t('shareTarget.discard')}
            </Button>
            <Button
              disabled={adding || organizationId === ''}
              onClick={() => void add()}
            >
              {adding ? <Spinner /> : null}
              {adding ? t('shareTarget.adding') : t('shareTarget.add')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

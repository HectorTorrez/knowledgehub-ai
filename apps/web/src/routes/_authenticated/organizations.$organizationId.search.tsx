import { collectionsApi } from '~/lib/api/collections';
import type { SearchResult } from '@knowledgehub/shared-types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { parseISO } from 'date-fns';
import {
  History,
  Search as SearchIcon,
  Sparkles,
  X as XIcon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { DatePicker } from '~/components/date-picker';
import { DocumentMultiSelect } from '~/components/document-multi-select';
import { EmptyState } from '~/components/empty-state';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { useSlashFocus } from '~/hooks/use-slash-focus';
import { queryKeys } from '~/lib/api/query-keys';
import { searchApi } from '~/lib/api/search';
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from '~/lib/recent-searches';
import { useT } from '~/lib/i18n/hooks';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { SEARCH_QUERY_MAX_LENGTH, searchQuerySchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/search',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('search.pageTitle'),
      description: t('search.pageDescription'),
    });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    collectionIds: Array.isArray(search.collectionIds)
      ? search.collectionIds
          .filter((id): id is string => typeof id === 'string')
          .slice(0, 20)
      : [],
    documentIds: Array.isArray(search.documentIds)
      ? search.documentIds
          .filter((id): id is string => typeof id === 'string')
          .slice(0, 20)
      : [],
    createdAfter:
      typeof search.createdAfter === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(search.createdAfter)
        ? search.createdAfter
        : '',
    createdBefore:
      typeof search.createdBefore === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(search.createdBefore)
        ? search.createdBefore
        : '',
  }),
  component: SearchPage,
});

function SearchPage() {
  const t = useT();
  const { organizationId } = Route.useParams();
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (filters.q) {
      setDraft(filters.q);
      setSubmitted(filters.q);
    }
  }, [filters.q]);
  function updateFilters(next: Partial<typeof filters>) {
    void navigate({ search: { ...filters, ...next }, replace: true });
  }
  const reportError = useReportError();
  const [recent, setRecent] = useState(() =>
    readRecentSearches(organizationId),
  );

  const ready = useReadyDocuments(organizationId);
  const collections = useQuery({
    queryKey: queryKeys.organizations.collections(organizationId),
    queryFn: () => collectionsApi.list(organizationId),
  });
  const documentId =
    filters.documentIds.length === 1 ? filters.documentIds[0] : undefined;
  const hasFilters =
    filters.collectionIds.length > 0 ||
    filters.documentIds.length > 0 ||
    filters.createdAfter !== '' ||
    filters.createdBefore !== '';
  const createdAfter =
    filters.createdAfter === '' ? undefined : parseISO(filters.createdAfter);
  const createdBefore =
    filters.createdBefore === '' ? undefined : parseISO(filters.createdBefore);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const results = useQuery({
    queryKey: queryKeys.organizations.search(
      organizationId,
      submitted,
      filters,
    ),
    queryFn: ({ signal }) =>
      searchApi.search(organizationId, submitted ?? '', {
        signal,
        ...filters,
      }),
    enabled: submitted !== null,
  });
  useQueryErrorToast(collections.error, () => void collections.refetch());
  useQueryErrorToast(ready.query.error, () => void ready.query.refetch());
  useQueryErrorToast(results.error, () => void results.refetch());

  function runSearch(query: string) {
    setSubmitted(query);
    setRecent(rememberSearch(organizationId, query));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = searchQuerySchema(t).safeParse({ q: draft });
    if (!parsed.success) {
      reportError(
        new Error(
          parsed.error.issues[0]?.message ?? t('validation.searchRequired'),
        ),
      );
      return;
    }

    runSearch(parsed.data.q);
  }

  function clearSearch() {
    setDraft('');
    setSubmitted(null);
  }

  const rows = results.data?.results ?? [];
  const isSearching = submitted !== null && results.isPending;
  const scopeLabel =
    filters.documentIds.length > 1
      ? t('search.scopeSelected')
      : documentId === undefined
        ? t('search.scopeAll')
        : (ready.documents.find((document) => document.id === documentId)
            ?.title ?? t('search.scopeOne'));

  return (
    <div className="space-y-6">
      {collections.isError ? (
        <RouteError
          title={t('documents.collectionsLoadError')}
          onRetry={() => void collections.refetch()}
        />
      ) : null}
      {ready.query.isError ? (
        <RouteError
          title={t('documents.loadError')}
          onRetry={() => void ready.query.refetch()}
        />
      ) : null}
      <PageHeader
        title={t('nav.search')}
        description={t('search.description')}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.queryLabel')}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            className="pr-12 pl-9 sm:pr-9"
          />
          {draft.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              aria-label={t('documents.clearSearch')}
              className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 sm:size-8 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </Button>
          ) : null}
        </div>
        <Button type="submit" disabled={isSearching}>
          {isSearching ? (
            <>
              <Spinner />
              {t('search.searching')}
            </>
          ) : (
            <>
              <SearchIcon />
              {t('nav.search')}
            </>
          )}
        </Button>
      </form>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <DocumentMultiSelect
              documents={ready.documents}
              selectedIds={filters.documentIds}
              onChange={(documentIds) => updateFilters({ documentIds })}
            />
          </div>
          <DocumentMultiSelect
            label={t('search.collections')}
            emptyLabel={t('documents.allCollections')}
            documents={(collections.data ?? []).map((item) => ({
              id: item.id,
              title: item.name,
            }))}
            selectedIds={filters.collectionIds}
            onChange={(collectionIds) => updateFilters({ collectionIds })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="search-created-after">
              {t('search.createdAfter')}
            </Label>
            <DatePicker
              id="search-created-after"
              ariaLabel={t('search.createdAfter')}
              value={filters.createdAfter}
              max={createdBefore ?? endOfToday}
              onChange={(createdAfter) => updateFilters({ createdAfter })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="search-created-before">
              {t('search.createdBefore')}
            </Label>
            <DatePicker
              id="search-created-before"
              ariaLabel={t('search.createdBefore')}
              value={filters.createdBefore}
              min={createdAfter}
              max={endOfToday}
              onChange={(createdBefore) => updateFilters({ createdBefore })}
            />
          </div>
          {hasFilters &&
          !(submitted !== null && results.isSuccess && rows.length === 0) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateFilters({
                  documentIds: [],
                  collectionIds: [],
                  createdAfter: '',
                  createdBefore: '',
                })
              }
            >
              {t('search.clearFilters')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {submitted === null ? (
        <div className="space-y-6">
          {recent.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <History className="size-4 text-muted-foreground" />
                  {t('search.recent')}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearRecentSearches(organizationId);
                    setRecent([]);
                  }}
                >
                  {t('search.clear')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((query) => (
                  <Button
                    key={query}
                    variant="outline"
                    size="sm"
                    className="min-h-11 rounded-full sm:min-h-0"
                    onClick={() => {
                      setDraft(query);
                      runSearch(query);
                    }}
                  >
                    {query}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <EmptyState
            icon={SearchIcon}
            title={t('search.emptyTitle')}
            description={t('search.emptyDescription')}
          />
        </div>
      ) : null}

      {isSearching ? (
        <div className="space-y-3" role="status" aria-live="polite">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : null}

      {submitted !== null && results.isError ? (
        <RouteError
          title={t('search.loadError')}
          onRetry={() => void results.refetch()}
        />
      ) : null}

      {submitted !== null && results.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title={t('search.noResults')}
          description={t('search.noResultsDescription', {
            query: submitted,
            scope: scopeLabel,
          })}
          action={
            <Button
              onClick={() =>
                updateFilters({
                  documentIds: [],
                  collectionIds: [],
                  createdAfter: '',
                  createdBefore: '',
                })
              }
            >
              {t('search.clearFilters')}
            </Button>
          }
        />
      ) : null}

      {submitted !== null && rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" role="status">
              {t('search.resultsFor', {
                count: rows.length,
                query: submitted,
                scope: scopeLabel,
              })}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/organizations/$organizationId/ask"
                params={{ organizationId }}
                search={{ q: submitted, documentId }}
              >
                <Sparkles />
                {t('search.askInstead')}
              </Link>
            </Button>
          </div>
          {rows.map((result) => (
            <SearchResultCard
              key={result.documentId}
              organizationId={organizationId}
              result={result}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchResultCard({
  organizationId,
  result,
}: Readonly<{ organizationId: string; result: SearchResult }>) {
  const t = useT();
  const match = Math.max(0, Math.min(100, Math.round(result.score * 100)));
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/organizations/$organizationId/documents/$documentId"
            params={{ organizationId, documentId: result.documentId }}
            search={{
              page: result.matches[0]?.pageNumber,
              quote: result.matches[0]?.excerpt,
            }}
            className="min-w-0 truncate text-sm font-medium hover:underline"
            title={t('search.openDocument', { title: result.documentTitle })}
          >
            {result.documentTitle}
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span>{t('search.match', { percent: match })}</span>
            <span>
              {t('search.page', { page: result.matches[0]?.pageNumber ?? '' })}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.matches[0] ? (
            <HighlightedExcerpt match={result.matches[0]} />
          ) : null}
        </p>
        {result.matches.length > 1 ? (
          <div className="mt-3 space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {expanded
                ? t('search.showFewer')
                : t('search.moreMatches', { count: result.matchCount - 1 })}
            </Button>
            {expanded
              ? result.matches.slice(1).map((item) => (
                  <div
                    key={`${item.pageNumber}-${item.chunkIndex}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span>{t('search.page', { page: item.pageNumber })}</span>
                    <p>
                      <HighlightedExcerpt match={item} />
                    </p>
                  </div>
                ))
              : null}
          </div>
        ) : null}
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <Link
            to="/organizations/$organizationId/ask"
            params={{ organizationId }}
            search={{ documentId: result.documentId }}
          >
            {t('search.askAboutDocument')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function HighlightedExcerpt({
  match,
}: Readonly<{ match: SearchResult['matches'][number] }>) {
  const ranges = match.highlights
    .map(({ start, end }) => ({
      start: Math.max(0, start),
      end: Math.min(match.excerpt.length, end),
    }))
    .filter(({ start, end }) => start < end)
    .sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(cursor, range.start);
    if (range.end <= start) continue;
    if (start > cursor) parts.push(match.excerpt.slice(cursor, start));
    parts.push(
      <mark key={`${start}-${range.end}`}>
        {match.excerpt.slice(start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  parts.push(match.excerpt.slice(cursor));
  return <>{parts}</>;
}

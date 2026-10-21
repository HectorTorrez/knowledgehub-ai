import type { SearchResult } from '@knowledgehub/shared-types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  History,
  LoaderCircle,
  Search as SearchIcon,
  Sparkles,
  X as XIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { queryKeys } from '~/lib/api/query-keys';
import { searchApi } from '~/lib/api/search';
import { ALL_DOCUMENTS } from '~/lib/document-scope';
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from '~/lib/recent-searches';
import { pageHead } from '~/lib/seo';
import { SEARCH_QUERY_MAX_LENGTH, searchQuerySchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/search',
)({
  head: () =>
    pageHead({
      title: 'Search · KnowledgeHub AI',
      description:
        "Search across your organization's documents with semantic retrieval.",
    }),
  component: SearchPage,
});

function SearchPage() {
  const { organizationId } = Route.useParams();
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [selection, setSelection] = useState(ALL_DOCUMENTS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [recent, setRecent] = useState(() =>
    readRecentSearches(organizationId),
  );

  const ready = useReadyDocuments(organizationId);
  const documentId = selection === ALL_DOCUMENTS ? undefined : selection;

  const results = useQuery({
    queryKey: queryKeys.organizations.search(
      organizationId,
      submitted,
      documentId,
    ),
    queryFn: ({ signal }) =>
      searchApi.search(organizationId, submitted ?? '', {
        signal,
        documentId,
      }),
    enabled: submitted !== null,
  });

  function runSearch(query: string) {
    setSubmitted(query);
    setRecent(rememberSearch(organizationId, query));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const parsed = searchQuerySchema.safeParse({ q: draft });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? 'Enter a search query.',
      );
      return;
    }

    runSearch(parsed.data.q);
  }

  function clearSearch() {
    setDraft('');
    setSubmitted(null);
    setValidationError(null);
  }

  const rows = results.data?.results ?? [];
  const isSearching = submitted !== null && results.isPending;
  const scopeLabel =
    documentId === undefined
      ? 'all ready documents'
      : (ready.documents.find((document) => document.id === documentId)
          ?.title ?? 'the selected document');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Find passages across this organization's ready documents."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search your documents…"
            aria-label="Search query"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            className="pr-12 pl-9 sm:pr-9"
          />
          {draft.length > 0 ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-1.5"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <Select
          value={selection}
          onValueChange={(value) => setSelection(value)}
        >
          <SelectTrigger className="sm:w-56" aria-label="Limit to a document">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DOCUMENTS}>All documents</SelectItem>
            {ready.documents.map((document) => (
              <SelectItem key={document.id} value={document.id}>
                {document.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isSearching}>
          {isSearching ? (
            <>
              <LoaderCircle className="animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <SearchIcon />
              Search
            </>
          )}
        </Button>
      </form>

      {validationError ? <ErrorNotice error={new Error(validationError)} /> : null}
      {results.isError ? <ErrorNotice error={results.error} /> : null}

      {submitted === null ? (
        <div className="space-y-6">
          {recent.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <History className="size-4 text-muted-foreground" />
                  Recent searches
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearRecentSearches(organizationId);
                    setRecent([]);
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((query) => (
                  <Button
                    key={query}
                    variant="outline"
                    size="sm"
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
            title="Search your documents"
            description="Type a query to find passages across everything this organization has ingested."
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

      {submitted !== null && !isSearching && rows.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No results"
          description={`Nothing matched “${submitted}” in ${scopeLabel}. Try different wording or broaden the scope.`}
        />
      ) : null}

      {submitted !== null && rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" role="status">
              {rows.length} {rows.length === 1 ? 'result' : 'results'} for “
              {submitted}” in {scopeLabel}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/organizations/$organizationId/ask"
                params={{ organizationId }}
                search={{ q: submitted, documentId }}
              >
                <Sparkles />
                Ask instead
              </Link>
            </Button>
          </div>
          {rows.map((result) => (
            <SearchResultCard
              key={`${result.documentId}-${result.chunkIndex}`}
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
  const match = Math.max(0, Math.min(100, Math.round(result.score * 100)));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/organizations/$organizationId/documents/$documentId"
            params={{ organizationId, documentId: result.documentId }}
            className="min-w-0 truncate text-sm font-medium hover:underline"
            title={`Open ${result.documentTitle}`}
          >
            {result.documentTitle}
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span>{match}% match</span>
            <span>Page {result.pageNumber}</span>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.excerpt}
        </p>
      </CardContent>
    </Card>
  );
}

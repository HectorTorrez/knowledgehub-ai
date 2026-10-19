import type { SearchResult } from '@knowledgehub/shared-types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoaderCircle, Search as SearchIcon, X as XIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '~/components/empty-state';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import { queryKeys } from '~/lib/api/query-keys';
import { searchApi } from '~/lib/api/search';
import { SEARCH_QUERY_MAX_LENGTH, searchQuerySchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/search',
)({
  head: () => ({ meta: [{ title: 'Search · KnowledgeHub AI' }] }),
  component: SearchPage,
});

function SearchPage() {
  const { organizationId } = Route.useParams();
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const results = useQuery({
    queryKey: queryKeys.organizations.search(organizationId, submitted),
    queryFn: ({ signal }) =>
      searchApi.search(organizationId, submitted ?? '', { signal }),
    enabled: submitted !== null,
  });

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

    setSubmitted(parsed.data.q);
  }

  function clearSearch() {
    setDraft('');
    setSubmitted(null);
    setValidationError(null);
  }

  const rows = results.data?.results ?? [];
  const isSearching = submitted !== null && results.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Find passages across this organization's ready documents."
      />

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search your documents…"
            aria-label="Search query"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            className="pr-9 pl-9"
            autoFocus
          />
          {draft.length > 0 ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
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
        <EmptyState
          icon={SearchIcon}
          title="Search your documents"
          description="Type a query to find passages across everything this organization has ingested."
        />
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
          description={`Nothing matched “${submitted}”. Try different wording.`}
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground" role="status">
            {rows.length} {rows.length === 1 ? 'result' : 'results'} for “
            {submitted}”
          </p>
          {rows.map((result) => (
            <SearchResultCard key={`${result.documentId}-${result.chunkIndex}`} result={result} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchResultCard({ result }: Readonly<{ result: SearchResult }>) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">
            {result.documentTitle}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            Page {result.pageNumber}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.excerpt}
        </p>
      </CardContent>
    </Card>
  );
}

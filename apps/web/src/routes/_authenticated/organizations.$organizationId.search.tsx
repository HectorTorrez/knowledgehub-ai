import type { SearchResult } from '@knowledgehub/shared-types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoaderCircle, Search as SearchIcon } from 'lucide-react';
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
import { searchQuerySchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/search',
)({
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

  const rows = results.data?.results ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Find passages across this organization's ready documents."
      />

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search your documents…"
            aria-label="Search query"
          />
        </div>
        <Button type="submit" disabled={results.isPending}>
          {results.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <SearchIcon />
          )}
          Search
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

      {results.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : null}

      {submitted !== null && !results.isPending && rows.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No results"
          description="Nothing matched your query. Try different wording."
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-3">
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

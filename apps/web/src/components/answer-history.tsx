import type { AnswerSummary } from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronDown, LoaderCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { cn } from '~/lib/utils';
import {
  AnswerBody,
  InsufficientEvidence,
  SourcesList,
} from './answer-content';
import { ErrorNotice } from './route-states';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function AnswerHistory({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const client = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const history = useInfiniteQuery({
    queryKey: queryKeys.organizations.answers.list(organizationId),
    queryFn: ({ pageParam }) =>
      answersApi.list(organizationId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const remove = useMutation({
    mutationFn: (answerId: string) =>
      answersApi.remove(organizationId, answerId),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.list(organizationId),
      }),
  });

  const rows = history.data?.pages.flatMap((page) => page.answers) ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">History</h2>

      {history.isError ? <ErrorNotice error={history.error} /> : null}

      {history.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}

      {!history.isPending && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions asked yet.</p>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map((answer) => (
                <HistoryRow
                  key={answer.id}
                  organizationId={organizationId}
                  answer={answer}
                  expanded={expandedId === answer.id}
                  onToggle={() =>
                    setExpandedId(expandedId === answer.id ? null : answer.id)
                  }
                  onDelete={() => remove.mutate(answer.id)}
                  deleting={remove.isPending && remove.variables === answer.id}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {history.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
          >
            {history.isFetchingNextPage ? (
              <LoaderCircle className="animate-spin" />
            ) : null}
            Load more
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function HistoryRow({
  organizationId,
  answer,
  expanded,
  onToggle,
  onDelete,
  deleting,
}: Readonly<{
  organizationId: string;
  answer: AnswerSummary;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}>) {
  return (
    <li>
      <div className="flex items-center gap-2 px-6 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              answer.status === 'answered' ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {answer.question}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {formatDateTime(answer.createdAt)}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete answer"
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </div>

      {expanded ? (
        <ExpandedAnswer organizationId={organizationId} answerId={answer.id} />
      ) : null}
    </li>
  );
}

function ExpandedAnswer({
  organizationId,
  answerId,
}: Readonly<{ organizationId: string; answerId: string }>) {
  const detail = useQuery({
    queryKey: queryKeys.organizations.answers.detail(organizationId, answerId),
    queryFn: () => answersApi.detail(organizationId, answerId),
  });

  if (detail.isPending) {
    return (
      <div className="border-t px-6 py-4">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="border-t px-6 py-4">
        <ErrorNotice error={detail.error} />
      </div>
    );
  }

  const answer = detail.data.answer;

  return (
    <div className="border-t px-6 py-4">
      {answer.status === 'answered' ? (
        <AnswerBody text={answer.answer ?? ''} />
      ) : (
        <InsufficientEvidence />
      )}

      {answer.citations.length > 0 ? (
        <div className="mt-4">
          <SourcesList citations={answer.citations} />
        </div>
      ) : null}
    </div>
  );
}

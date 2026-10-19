import type { AnswerResponse, AnswerSummary } from '@knowledgehub/shared-types';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Skeleton } from './ui/skeleton';
import { useToast } from './ui/toast';

export interface LatestAnswer {
  question: string;
  response: AnswerResponse;
  scopeLabel: string;
}

export function AnswerThread({
  organizationId,
  latest,
}: Readonly<{ organizationId: string; latest?: LatestAnswer }>) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnswerSummary | null>(null);

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
    onSuccess: () => {
      toast({ variant: 'success', title: 'Question removed from history' });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.list(organizationId),
      });
    },
  });

  async function handleDelete() {
    if (deleteTarget === null) {
      return;
    }

    try {
      await remove.mutateAsync(deleteTarget.id);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
      }
      setDeleteTarget(null);
    } catch {
      return;
    }
  }

  const rows = history.data?.pages.flatMap((page) => page.answers) ?? [];
  const newestMatch = latest
    ? rows.find((row) => row.question === latest.question)
    : undefined;
  const earlier = newestMatch
    ? rows.filter((row) => row.id !== newestMatch.id)
    : rows;

  return (
    <section className="space-y-4">
      {latest ? (
        <LatestAnswerCard
          latest={latest}
          onRequestDelete={
            newestMatch
              ? () => {
                  remove.reset();
                  setDeleteTarget(newestMatch);
                }
              : undefined
          }
        />
      ) : null}

      {history.isError ? <ErrorNotice error={history.error} /> : null}
      {remove.isError && deleteTarget === null ? (
        <ErrorNotice error={remove.error} />
      ) : null}

      {history.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}

      {!history.isPending && !latest && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Questions you ask will appear here so you can revisit their answers.
        </p>
      ) : null}

      {earlier.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            {latest ? 'Earlier questions' : 'History'}
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {earlier.map((answer) => (
                  <HistoryRow
                    key={answer.id}
                    organizationId={organizationId}
                    answer={answer}
                    expanded={expandedId === answer.id}
                    onToggle={() =>
                      setExpandedId(expandedId === answer.id ? null : answer.id)
                    }
                    onRequestDelete={() => {
                      remove.reset();
                      setDeleteTarget(answer);
                    }}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
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
            <DialogTitle>Remove from history</DialogTitle>
            <DialogDescription>
              This permanently removes this question and its answer from your
              history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError ? <ErrorNotice error={remove.error} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void handleDelete()}
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LatestAnswerCard({
  latest,
  onRequestDelete,
}: Readonly<{ latest: LatestAnswer; onRequestDelete?: () => void }>) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Question
              </p>
              <p className="text-sm font-medium">{latest.question}</p>
              <p className="text-xs text-muted-foreground">
                Answered from {latest.scopeLabel}
              </p>
            </div>
            {onRequestDelete ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRequestDelete}
                aria-label={`Remove “${latest.question}” from history`}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            ) : null}
          </div>

          {latest.response.status === 'answered' ? (
            <AnswerBody text={latest.response.answer} />
          ) : (
            <InsufficientEvidence />
          )}
        </CardContent>
      </Card>

      {latest.response.citations.length > 0 ? (
        <SourcesList citations={latest.response.citations} />
      ) : null}
    </div>
  );
}

function HistoryRow({
  organizationId,
  answer,
  expanded,
  onToggle,
  onRequestDelete,
}: Readonly<{
  organizationId: string;
  answer: AnswerSummary;
  expanded: boolean;
  onToggle: () => void;
  onRequestDelete: () => void;
}>) {
  return (
    <li>
      <div className="flex items-center gap-2 px-6 py-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              {answer.status === 'answered' ? '' : ' · Not answered'}
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
          onClick={onRequestDelete}
          aria-label={`Remove “${answer.question}” from history`}
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

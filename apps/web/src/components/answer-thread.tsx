import type { AnswerResponse, AnswerSummary } from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AnswerActions, AnswerFeedback } from '~/components/answer-actions';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/provider';
import { cn } from '~/lib/utils';
import {
  AnswerBody,
  InsufficientEvidence,
  PartialAnswerNotice,
  SourcesList,
} from './answer-content';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button, buttonVariants } from './ui/button';
import { Card, CardContent } from './ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { Skeleton } from './ui/skeleton';
import { Spinner } from './ui/spinner';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
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
  const t = useT();
  const client = useQueryClient();
  const { toast } = useToast();
  const reportError = useReportError();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnswerSummary | null>(null);
  const [scope, setScope] = useState<'me' | 'organization'>('me');

  const history = useInfiniteQuery({
    queryKey: queryKeys.organizations.answers.list(
      organizationId,
      undefined,
      scope,
    ),
    queryFn: ({ pageParam }) =>
      answersApi.list(organizationId, { cursor: pageParam, askedBy: scope }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  useQueryErrorToast(history.error, () => void history.refetch());

  const remove = useMutation({
    mutationFn: (answerId: string) =>
      answersApi.remove(organizationId, answerId),
    onSuccess: () => {
      toast({
        variant: 'success',
        title: t('answerThread.removedFromHistory'),
      });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.list(organizationId),
      });
    },
    onError: (error) => reportError(error),
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
          organizationId={organizationId}
          answerId={newestMatch?.id}
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

      {history.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}

      {!history.isPending && !latest && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('answerThread.emptyHint')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {scope === 'me'
            ? t('answerThread.yourQuestionsDescription')
            : t('answerThread.everyoneDescription')}
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label={t('answerThread.historyScope')}
          value={scope}
          onValueChange={(value) => {
            if (value === 'me' || value === 'organization') {
              setScope(value);
            }
          }}
        >
          <ToggleGroupItem value="me">
            {t('answerThread.yourQuestions')}
          </ToggleGroupItem>
          <ToggleGroupItem value="organization">
            {t('answerThread.everyone')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {earlier.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            {latest
              ? t('answerThread.earlierQuestions')
              : t('answerThread.history')}
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
            {history.isFetchingNextPage ? <Spinner /> : null}
            {t('orgSettings.loadMore')}
          </Button>
        </div>
      ) : null}

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
            <AlertDialogTitle>{t('answerThread.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('answerThread.removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {remove.isPending
                ? t('answerThread.removing')
                : t('answerThread.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function LatestAnswerCard({
  organizationId,
  answerId,
  latest,
  onRequestDelete,
}: Readonly<{
  organizationId: string;
  answerId?: string;
  latest: LatestAnswer;
  onRequestDelete?: () => void;
}>) {
  const t = useT();

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('answerThread.question')}
              </p>
              <p className="text-sm font-medium">{latest.question}</p>
              <p className="text-xs text-muted-foreground">
                {t('answerThread.answeredFrom', { scope: latest.scopeLabel })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {answerId !== undefined ? (
                <AnswerFeedback
                  organizationId={organizationId}
                  answerId={answerId}
                />
              ) : null}
              <AnswerActions
                organizationId={organizationId}
                answerId={answerId}
                question={latest.question}
                answer={
                  latest.response.status !== 'insufficient_evidence'
                    ? latest.response.answer
                    : null
                }
                status={latest.response.status}
                missing={
                  latest.response.status === 'partial'
                    ? latest.response.missing
                    : []
                }
                citations={latest.response.citations}
              />
              {onRequestDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRequestDelete}
                  aria-label={t('answerThread.removeAria', {
                    question: latest.question,
                  })}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {latest.response.status !== 'insufficient_evidence' ? (
            <AnswerBody
              text={latest.response.answer}
              sourceIdPrefix="latest-answer"
            />
          ) : (
            <InsufficientEvidence />
          )}
          {latest.response.status === 'partial' ? (
            <PartialAnswerNotice missing={latest.response.missing} />
          ) : null}
        </CardContent>
      </Card>

      {latest.response.citations.length > 0 ? (
        <SourcesList
          citations={latest.response.citations}
          organizationId={organizationId}
          sourceIdPrefix="latest-answer"
        />
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
  const t = useT();
  const locale = useLocale();

  return (
    <Collapsible asChild open={expanded} onOpenChange={() => onToggle()}>
      <li>
        <div className="flex items-center gap-2 px-4 py-4 sm:px-6">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto sm:h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left font-normal whitespace-normal hover:bg-transparent"
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  answer.status === 'answered'
                    ? 'bg-success'
                    : 'bg-muted-foreground/40',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {answer.question}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {formatDateTime(answer.createdAt, locale)}
                  {answer.status === 'partial'
                    ? t('answerThread.partialAnswer')
                    : answer.status === 'answered'
                      ? ''
                      : t('answerThread.notAnswered')}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  expanded && 'rotate-180',
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRequestDelete}
            aria-label={t('answerThread.removeAria', {
              question: answer.question,
            })}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <CollapsibleContent>
          <ExpandedAnswer
            organizationId={organizationId}
            answerId={answer.id}
          />
        </CollapsibleContent>
      </li>
    </Collapsible>
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
  useQueryErrorToast(detail.error, () => void detail.refetch());

  if (detail.isPending) {
    return (
      <div className="border-t px-4 py-4 sm:px-6">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (detail.isError) {
    return null;
  }

  const answer = detail.data.answer;

  return (
    <div className="border-t px-4 py-4 sm:px-6">
      {answer.status !== 'insufficient_evidence' ? (
        <AnswerBody
          text={answer.answer ?? ''}
          sourceIdPrefix={`answer-${answer.id}`}
        />
      ) : (
        <InsufficientEvidence />
      )}

      {answer.status === 'partial' ? (
        <PartialAnswerNotice missing={answer.missing ?? []} />
      ) : null}

      {answer.citations.length > 0 ? (
        <div className="mt-4">
          <SourcesList
            citations={answer.citations}
            organizationId={organizationId}
            sourceIdPrefix={`answer-${answer.id}`}
          />
        </div>
      ) : null}

      <div className="mt-3 flex justify-end gap-1">
        <AnswerFeedback
          organizationId={organizationId}
          answerId={answer.id}
          initial={answer.feedback}
        />
        <AnswerActions
          organizationId={organizationId}
          answerId={answer.id}
          question={answer.question}
          answer={answer.answer}
          status={answer.status}
          citations={answer.citations}
          missing={answer.missing ?? []}
        />
      </div>
    </div>
  );
}

import type {
  AnswerFeedbackSummary,
  AnswerResponse,
  AnswerSummary,
} from '@knowledgehub/shared-types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown, LoaderCircle, Sparkles } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnswerActions, AnswerFeedback } from '~/components/answer-actions';
import {
  AnswerBody,
  AnswerSources,
  InsufficientEvidence,
} from '~/components/answer-content';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';
import { sourceId } from '~/lib/answer-source';
import { formatDateTime } from '~/lib/format';

export interface AskedQuestion {
  question: string;
  documentId: string | undefined;
  scopeLabel: string;
}

export interface StreamSnapshot {
  status: 'idle' | 'streaming' | 'done' | 'error';
  answerStatus: AnswerResponse['status'] | null;
  text: string;
  citations: AnswerResponse['citations'];
}

export function ConversationMessages({
  organizationId,
  conversationId,
  pending,
  stream,
}: Readonly<{
  organizationId: string;
  conversationId: string;
  pending: AskedQuestion | null;
  stream: StreamSnapshot;
}>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const pendingQuestionRef = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const answers = useInfiniteQuery({
    queryKey: queryKeys.organizations.answers.list(
      organizationId,
      conversationId,
    ),
    queryFn: ({ pageParam }) =>
      answersApi.list(organizationId, {
        conversationId,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const rows = useMemo(
    () =>
      (answers.data?.pages.flatMap((page) => page.answers) ?? [])
        .slice()
        .reverse(),
    [answers.data],
  );

  const persisted = useMemo(
    () => new Set(rows.map((row) => row.question)),
    [rows],
  );
  const pendingVisible =
    pending !== null &&
    stream.status !== 'error' &&
    (!persisted.has(pending.question) || stream.status === 'streaming');

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  function handleScroll() {
    const element = scrollRef.current;

    if (element === null) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedRef.current = distance < 96;
    setShowJump(distance > 220);
  }

  useEffect(() => {
    pinnedRef.current = true;
    setShowJump(false);
    scrollToEnd('auto');
  }, [conversationId, scrollToEnd]);

  useEffect(() => {
    if (pending === null) {
      pendingQuestionRef.current = null;
      return;
    }

    if (pendingQuestionRef.current === pending.question) {
      return;
    }

    pendingQuestionRef.current = pending.question;
    pinnedRef.current = true;
    setShowJump(false);
    scrollToEnd('smooth');
  }, [pending, scrollToEnd]);

  useEffect(() => {
    if (!pinnedRef.current) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    scrollToEnd(
      prefersReducedMotion || stream.status === 'streaming' ? 'auto' : 'smooth',
    );
  }, [
    conversationId,
    rows.length,
    pendingVisible,
    stream.text.length,
    stream.status,
    scrollToEnd,
  ]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
          {answers.isError ? <ErrorNotice error={answers.error} /> : null}

          {answers.isPending && rows.length === 0 && !pendingVisible ? (
            <div className="space-y-3">
              <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
              <AssistantFrame heading="KnowledgeHub">
                <Skeleton className="h-24 w-full rounded-2xl" />
              </AssistantFrame>
            </div>
          ) : null}

          {answers.hasNextPage ? (
            <div className="mb-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => answers.fetchNextPage()}
                disabled={answers.isFetchingNextPage}
              >
                {answers.isFetchingNextPage ? (
                  <LoaderCircle className="animate-spin" />
                ) : null}
                Load earlier questions
              </Button>
            </div>
          ) : null}

          {rows.length === 0 && !pendingVisible && !answers.isPending ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              This conversation has no questions yet.
            </p>
          ) : null}

          <ol className="flex flex-col gap-8">
            {rows.map((answer) => (
              <li key={answer.id}>
                <PersistedTurn
                  organizationId={organizationId}
                  answer={answer}
                />
              </li>
            ))}

            {pendingVisible && pending !== null ? (
              <li>
                <PendingTurn pending={pending} stream={stream} />
              </li>
            ) : null}
          </ol>

          <div ref={endRef} className="h-px shrink-0" />
        </div>
      </div>

      {showJump ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-md"
          onClick={() => {
            pinnedRef.current = true;
            setShowJump(false);
            scrollToEnd('smooth');
          }}
        >
          <ArrowDown />
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}

function PersistedTurn({
  organizationId,
  answer,
}: Readonly<{ organizationId: string; answer: AnswerSummary }>) {
  const detail = useQuery({
    queryKey: queryKeys.organizations.answers.detail(organizationId, answer.id),
    queryFn: () => answersApi.detail(organizationId, answer.id),
  });

  return (
    <article className="space-y-3">
      <QuestionBubble question={answer.question} />

      {detail.isPending ? (
        <AssistantFrame
          heading="KnowledgeHub"
          meta={formatDateTime(answer.createdAt)}
        >
          <Skeleton className="h-24 w-full rounded-2xl" />
        </AssistantFrame>
      ) : null}

      {detail.isError ? (
        <AssistantFrame
          heading="KnowledgeHub"
          meta={formatDateTime(answer.createdAt)}
        >
          <ErrorNotice error={detail.error} />
        </AssistantFrame>
      ) : null}

      {detail.data ? (
        <AssistantAnswer
          organizationId={organizationId}
          answerId={detail.data.answer.id}
          question={detail.data.answer.question}
          answer={detail.data.answer.answer}
          status={detail.data.answer.status}
          citations={detail.data.answer.citations}
          createdAt={detail.data.answer.createdAt}
          feedback={detail.data.answer.feedback}
          sourceIdPrefix={`answer-${detail.data.answer.id}`}
        />
      ) : null}
    </article>
  );
}

function PendingTurn({
  pending,
  stream,
}: Readonly<{ pending: AskedQuestion; stream: StreamSnapshot }>) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<number | null>(null);
  const hasText = stream.text.length > 0;
  const insufficient = stream.answerStatus === 'insufficient_evidence';

  useEffect(() => {
    if (pendingSource === null || !sourcesOpen) {
      return;
    }

    const element = document.getElementById(
      sourceId('pending-answer', pendingSource),
    );

    if (element !== null) {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }

    setPendingSource(null);
  }, [pendingSource, sourcesOpen]);

  return (
    <article className="space-y-3">
      <QuestionBubble question={pending.question} />

      <AssistantFrame
        heading="KnowledgeHub"
        meta={`Answered from ${pending.scopeLabel}`}
      >
        <Card className="rounded-2xl shadow-none">
          <CardContent
            role="status"
            aria-live="polite"
            className="space-y-3 p-4 sm:p-5"
          >
            {insufficient ? (
              <InsufficientEvidence />
            ) : hasText ? (
              <AnswerBody
                text={stream.text}
                sourceIdPrefix="pending-answer"
                onCitationSelect={(marker) => {
                  setSourcesOpen(true);
                  setPendingSource(marker);
                }}
              />
            ) : stream.status === 'streaming' ? (
              <ThinkingIndicator scopeLabel={pending.scopeLabel} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No answer was returned. Try rephrasing the question.
              </p>
            )}

            {stream.status === 'streaming' && hasText ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                Writing…
              </p>
            ) : null}
          </CardContent>
        </Card>

        {stream.citations.length > 0 ? (
          <AnswerSources
            citations={stream.citations}
            sourceIdPrefix="pending-answer"
            open={sourcesOpen}
            onOpenChange={setSourcesOpen}
          />
        ) : null}
      </AssistantFrame>
    </article>
  );
}

function AssistantAnswer({
  organizationId,
  answerId,
  question,
  answer,
  status,
  citations,
  createdAt,
  feedback,
  sourceIdPrefix,
}: Readonly<{
  organizationId: string;
  answerId: string;
  question: string;
  answer: string | null;
  status: AnswerResponse['status'];
  citations: AnswerResponse['citations'];
  createdAt: string;
  feedback: AnswerFeedbackSummary | null;
  sourceIdPrefix: string;
}>) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<number | null>(null);

  useEffect(() => {
    if (pendingSource === null || !sourcesOpen) {
      return;
    }

    const element = document.getElementById(
      sourceId(sourceIdPrefix, pendingSource),
    );

    if (element !== null) {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }

    setPendingSource(null);
  }, [pendingSource, sourcesOpen, sourceIdPrefix]);

  return (
    <AssistantFrame
      heading="KnowledgeHub"
      meta={formatDateTime(createdAt)}
    >
      <Card className="rounded-2xl shadow-none">
        <CardContent className="space-y-3 p-4 sm:p-5">
          {status === 'answered' ? (
            <AnswerBody
              text={answer ?? ''}
              sourceIdPrefix={sourceIdPrefix}
              onCitationSelect={(marker) => {
                setSourcesOpen(true);
                setPendingSource(marker);
              }}
            />
          ) : (
            <InsufficientEvidence />
          )}
        </CardContent>
      </Card>

      {citations.length > 0 ? (
        <AnswerSources
          citations={citations}
          organizationId={organizationId}
          sourceIdPrefix={sourceIdPrefix}
          open={sourcesOpen}
          onOpenChange={setSourcesOpen}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] text-muted-foreground">
          Was this helpful?
        </span>
        <AnswerFeedback
          organizationId={organizationId}
          answerId={answerId}
          initial={feedback}
        />
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <AnswerActions
          organizationId={organizationId}
          answerId={answerId}
          question={question}
          answer={answer}
          status={status}
          citations={citations}
        />
      </div>
    </AssistantFrame>
  );
}

function AssistantFrame({
  heading,
  meta,
  children,
}: Readonly<{
  heading: string;
  meta?: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex gap-2.5 sm:gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40"
      >
        <Sparkles className="size-3.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{heading}</span>
          {meta !== undefined ? <span>{meta}</span> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function QuestionBubble({
  question,
}: Readonly<{ question: string }>) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-muted px-4 py-2.5">
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {question}
        </p>
      </div>
    </div>
  );
}

function ThinkingIndicator({ scopeLabel }: Readonly<{ scopeLabel: string }>) {
  return (
    <div className="flex items-center gap-2.5 py-0.5 text-sm text-muted-foreground">
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </span>
      Searching {scopeLabel}…
    </div>
  );
}

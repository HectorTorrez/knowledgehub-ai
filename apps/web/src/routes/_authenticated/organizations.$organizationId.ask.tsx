import type {
  AnswerResponse,
  AnswerSummary,
  ConversationSummary,
} from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  LoaderCircle,
  MessageSquarePlus,
  Send,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { AnswerActions } from '~/components/answer-actions';
import { AnswerThread } from '~/components/answer-thread';
import {
  AnswerBody,
  InsufficientEvidence,
  SourcesList,
} from '~/components/answer-content';
import { DocumentScopeSelect } from '~/components/document-scope-select';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { Textarea } from '~/components/ui/textarea';
import { useToast } from '~/components/ui/toast';
import { useAnswerStream } from '~/hooks/use-answer-stream';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { answersApi } from '~/lib/api/answers';
import { conversationsApi } from '~/lib/api/conversations';
import { queryKeys } from '~/lib/api/query-keys';
import { ALL_DOCUMENTS, resolveDocumentScope } from '~/lib/document-scope';
import { formatDateTime } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { cn } from '~/lib/utils';
import { questionSchema, QUESTION_MAX_LENGTH } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/ask',
)({
  head: () =>
    pageHead({
      title: 'Ask a question · KnowledgeHub AI',
      description:
        "Ask a question and get answers grounded in your organization's documents, with citations.",
    }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { answer?: string; q?: string; documentId?: string } => ({
    answer:
      typeof search.answer === 'string' && search.answer.trim().length > 0
        ? search.answer
        : undefined,
    q:
      typeof search.q === 'string' && search.q.trim().length > 0
        ? search.q
        : undefined,
    documentId:
      typeof search.documentId === 'string' && search.documentId.trim().length > 0
        ? search.documentId
        : undefined,
  }),
  component: AskPage,
});

const SUGGESTED_QUESTIONS = [
  'Summarize the key points in these documents.',
  'What policies should every new employee know?',
  'What are the most important deadlines or dates?',
];

interface AskedQuestion {
  question: string;
  documentId: string | undefined;
  scopeLabel: string;
}

function AskPage() {
  const { organizationId } = Route.useParams();
  const {
    answer: permalinkAnswerId,
    q: presetQuestion,
    documentId: presetDocumentId,
  } = Route.useSearch();
  const client = useQueryClient();
  const { toast } = useToast();
  const [question, setQuestion] = useState(presetQuestion ?? '');
  const [selection, setSelection] = useState(
    presetDocumentId ?? ALL_DOCUMENTS,
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [asked, setAsked] = useState<AskedQuestion | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);

  const ready = useReadyDocuments(organizationId);
  const scope = resolveDocumentScope(selection, ready.documents);
  const stream = useAnswerStream(organizationId);

  const conversations = useInfiniteQuery({
    queryKey: queryKeys.organizations.conversations.list(organizationId),
    queryFn: ({ pageParam }) =>
      conversationsApi.list(organizationId, { cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const createConversation = useMutation({
    mutationFn: () => conversationsApi.create(organizationId),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.conversations.list(organizationId),
      }),
  });

  const removeConversation = useMutation({
    mutationFn: (conversationId: string) =>
      conversationsApi.remove(organizationId, conversationId),
    onSuccess: (_data, conversationId) => {
      if (activeConversationId === conversationId) {
        startNewConversation();
      }

      toast({ variant: 'success', title: 'Conversation deleted' });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.conversations.all(organizationId),
      });
    },
  });

  useEffect(() => {
    if (stream.status !== 'done' || activeConversationId === null) {
      return;
    }

    void client.invalidateQueries({
      queryKey: queryKeys.organizations.answers.list(
        organizationId,
        activeConversationId,
      ),
    });
    void client.invalidateQueries({
      queryKey: queryKeys.organizations.conversations.list(organizationId),
    });
  }, [stream.status, activeConversationId, client, organizationId]);

  async function submit() {
    if (stream.status === 'streaming') {
      return;
    }

    setValidationError(null);

    const result = questionSchema.safeParse({ question });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Enter a question.');
      return;
    }

    const questionText = result.data.question;
    let conversationId = activeConversationId;

    if (conversationId === null) {
      try {
        const created = await createConversation.mutateAsync();
        conversationId = created.conversation.id;
        setActiveConversationId(conversationId);
      } catch {
        return;
      }
    }

    setAsked({
      question: questionText,
      documentId: scope.documentId,
      scopeLabel: scope.label,
    });
    setQuestion('');

    await stream.ask(questionText, scope.documentId, conversationId);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function startNewConversation() {
    stream.reset();
    setAsked(null);
    setActiveConversationId(null);
    setQuestion('');
    setValidationError(null);
  }

  function selectConversation(conversationId: string) {
    if (conversationId === activeConversationId) {
      return;
    }

    stream.reset();
    setAsked(null);
    setActiveConversationId(conversationId);
    setQuestion('');
    setValidationError(null);
  }

  async function handleDelete() {
    if (deleteTarget === null) {
      return;
    }

    try {
      await removeConversation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      return;
    }
  }

  const streaming = stream.status === 'streaming';
  const conversationRows =
    conversations.data?.pages.flatMap((page) => page.conversations) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ask a question"
        description="Answers are grounded in the documents you choose and cite their sources. Follow-ups keep the conversation context."
      />

      {permalinkAnswerId !== undefined ? (
        <PermalinkAnswer
          organizationId={organizationId}
          answerId={permalinkAnswerId}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border bg-card lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              onClick={startNewConversation}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 lg:max-h-[calc(100dvh-14rem)]">
            {conversations.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : null}

            {conversations.isError ? (
              <ErrorNotice error={conversations.error} />
            ) : null}

            {!conversations.isPending && conversationRows.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                Your conversations will appear here.
              </p>
            ) : null}

            <ul className="space-y-1">
              {conversationRows.map((conversation) => (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      'group flex items-center gap-1 rounded-md',
                      conversation.id === activeConversationId
                        ? 'bg-muted'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      aria-current={
                        conversation.id === activeConversationId
                          ? 'true'
                          : undefined
                      }
                      className="min-w-0 flex-1 rounded-md px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="block truncate text-sm">
                        {conversation.title ?? 'New conversation'}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatDateTime(conversation.createdAt)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${
                        conversation.title ?? 'this conversation'
                      }`}
                      className="mr-1 size-8 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      onClick={() => setDeleteTarget(conversation)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {conversations.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => conversations.fetchNextPage()}
                disabled={conversations.isFetchingNextPage}
              >
                {conversations.isFetchingNextPage ? (
                  <LoaderCircle className="animate-spin" />
                ) : null}
                Load older
              </Button>
            ) : null}
          </div>
        </aside>

        <div className="space-y-6">
          {activeConversationId === null ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-1">
                  <h2 className="font-semibold">Start a conversation</h2>
                  <p className="text-sm text-muted-foreground">
                    Ask a question below. Follow-ups use the earlier turns as
                    context, and every answer cites its sources.
                  </p>
                </div>

                {ready.documents.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Try asking
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setQuestion(suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to="/organizations/$organizationId/documents"
                      params={{ organizationId }}
                    >
                      Upload a document first
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ConversationMessages
              organizationId={organizationId}
              conversationId={activeConversationId}
              pending={asked}
              stream={{
                status: stream.status,
                answerStatus: stream.answerStatus,
                text: stream.text,
                citations: stream.citations,
              }}
            />
          )}

          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {validationError ? (
                  <ErrorNotice error={new Error(validationError)} />
                ) : null}
                {stream.status === 'error' ? (
                  <ErrorNotice error={stream.error} />
                ) : null}
                {createConversation.isError ? (
                  <ErrorNotice error={createConversation.error} />
                ) : null}
                {removeConversation.isError ? (
                  <ErrorNotice error={removeConversation.error} />
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="document-scope">Answer from</Label>
                  <DocumentScopeSelect
                    documents={ready.documents}
                    value={scope.documentId ?? ALL_DOCUMENTS}
                    onValueChange={setSelection}
                    disabled={ready.query.isPending || streaming}
                  />
                  <p className="text-xs text-muted-foreground">
                    {scopeHint(ready.query.isPending, ready.documents.length)}
                  </p>
                  {ready.query.isError ? (
                    <ErrorNotice error={ready.query.error} />
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="question">Your question</Label>
                  <Textarea
                    id="question"
                    rows={4}
                    maxLength={QUESTION_MAX_LENGTH}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleKeyDown}
                    aria-describedby="question-hint"
                    placeholder="What is the parental leave policy?"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p id="question-hint" className="text-xs text-muted-foreground">
                    {question.length}/{QUESTION_MAX_LENGTH} · Enter to ask,
                    Shift+Enter for a new line
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      streaming ||
                      question.trim().length === 0 ||
                      createConversation.isPending
                    }
                  >
                    {streaming || createConversation.isPending ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Thinking…
                      </>
                    ) : (
                      <>
                        <Send />
                        Ask
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {activeConversationId === null ? (
            <AnswerThread organizationId={organizationId} />
          ) : null}
        </div>
      </div>

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
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              This permanently removes the conversation and every answer in it.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {removeConversation.isError ? (
            <ErrorNotice error={removeConversation.error} />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeConversation.isPending}
              onClick={() => void handleDelete()}
            >
              {removeConversation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermalinkAnswer({
  organizationId,
  answerId,
}: Readonly<{ organizationId: string; answerId: string }>) {
  const detail = useQuery({
    queryKey: queryKeys.organizations.answers.detail(organizationId, answerId),
    queryFn: () => answersApi.detail(organizationId, answerId),
  });

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Shared answer
          </p>
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/organizations/$organizationId/ask"
              params={{ organizationId }}
            >
              Close
            </Link>
          </Button>
        </div>

        {detail.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {detail.isError ? <ErrorNotice error={detail.error} /> : null}
        {detail.data ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{detail.data.answer.question}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(detail.data.answer.createdAt)}
              </p>
            </div>
            {detail.data.answer.status === 'answered' ? (
              <AnswerBody text={detail.data.answer.answer ?? ''} />
            ) : (
              <InsufficientEvidence />
            )}
            {detail.data.answer.citations.length > 0 ? (
              <SourcesList
                citations={detail.data.answer.citations}
                organizationId={organizationId}
              />
            ) : null}
            <div className="flex justify-end">
              <AnswerActions
                organizationId={organizationId}
                answerId={detail.data.answer.id}
                question={detail.data.answer.question}
                answer={detail.data.answer.answer}
                status={detail.data.answer.status}
                citations={detail.data.answer.citations}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface StreamSnapshot {
  status: 'idle' | 'streaming' | 'done' | 'error';
  answerStatus: AnswerResponse['status'] | null;
  text: string;
  citations: AnswerResponse['citations'];
}

function ConversationMessages({
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
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (stream.status !== 'done') {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [stream.status, rows.length]);

  return (
    <section aria-label="Conversation" className="space-y-4">
      {answers.isError ? <ErrorNotice error={answers.error} /> : null}

      {answers.isPending && rows.length === 0 && !pendingVisible ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : null}

      {answers.hasNextPage ? (
        <div className="flex justify-center">
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
        <p className="text-sm text-muted-foreground">
          This conversation has no questions yet.
        </p>
      ) : null}

      <ol className="space-y-6">
        {rows.map((answer) => (
          <li key={answer.id}>
            <PersistedAnswer
              organizationId={organizationId}
              answer={answer}
            />
          </li>
        ))}

        {pendingVisible && pending !== null ? (
          <li>
            <PendingAnswer pending={pending} stream={stream} />
          </li>
        ) : null}
      </ol>

      <div ref={endRef} />
    </section>
  );
}

function PersistedAnswer({
  organizationId,
  answer,
}: Readonly<{ organizationId: string; answer: AnswerSummary }>) {
  const detail = useQuery({
    queryKey: queryKeys.organizations.answers.detail(organizationId, answer.id),
    queryFn: () => answersApi.detail(organizationId, answer.id),
    staleTime: Infinity,
  });

  return (
    <article className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Question
        </p>
        <p className="text-sm font-medium">{answer.question}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(answer.createdAt)}
        </p>
      </div>

      {detail.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}

      {detail.isError ? <ErrorNotice error={detail.error} /> : null}

      {detail.data ? (
        <>
          <Card>
            <CardContent className="p-6">
              {detail.data.answer.status === 'answered' ? (
                <AnswerBody text={detail.data.answer.answer ?? ''} />
              ) : (
                <InsufficientEvidence />
              )}
            </CardContent>
          </Card>
          {detail.data.answer.citations.length > 0 ? (
            <SourcesList
              citations={detail.data.answer.citations}
              organizationId={organizationId}
            />
          ) : null}
          <div className="flex justify-end">
            <AnswerActions
              organizationId={organizationId}
              answerId={detail.data.answer.id}
              question={detail.data.answer.question}
              answer={detail.data.answer.answer}
              status={detail.data.answer.status}
              citations={detail.data.answer.citations}
            />
          </div>
        </>
      ) : null}
    </article>
  );
}

function PendingAnswer({
  pending,
  stream,
}: Readonly<{ pending: AskedQuestion; stream: StreamSnapshot }>) {
  return (
    <article className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Question
        </p>
        <p className="text-sm font-medium">{pending.question}</p>
        <p className="text-xs text-muted-foreground">
          Answered from {pending.scopeLabel}
        </p>
      </div>

      <Card>
        <CardContent role="status" aria-live="polite" className="space-y-3 p-6">
          {stream.answerStatus === 'insufficient_evidence' ? (
            <InsufficientEvidence />
          ) : stream.text.length > 0 ? (
            <AnswerBody text={stream.text} />
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Searching {pending.scopeLabel}…
            </span>
          )}

          {stream.status === 'streaming' && stream.text.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Writing…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {stream.citations.length > 0 ? (
        <SourcesList citations={stream.citations} />
      ) : null}
    </article>
  );
}

function scopeHint(isPending: boolean, readyCount: number): string {
  if (isPending) {
    return 'Loading this organization’s documents…';
  }

  if (readyCount === 0) {
    return 'No documents are ready yet — upload one to ask questions about it.';
  }

  return 'Search every document, or narrow this question to one.';
}

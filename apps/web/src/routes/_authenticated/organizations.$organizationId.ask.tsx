import type { ConversationSummary } from '@knowledgehub/shared-types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowUpRight,
  MessageSquareText,
  PanelLeft,
  SquarePen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnswerActions, AnswerFeedback } from '~/components/answer-actions';
import {
  AnswerBody,
  InsufficientEvidence,
  SourcesList,
} from '~/components/answer-content';
import { AskComposer } from '~/components/ask-composer';
import {
  ConversationMessages,
  type AskedQuestion,
} from '~/components/ask-messages';
import { AnswerThread } from '~/components/answer-thread';
import { ConversationRail } from '~/components/conversation-rail';
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
import { Skeleton } from '~/components/ui/skeleton';
import { useToast } from '~/components/ui/toast';
import { useAnswerStream } from '~/hooks/use-answer-stream';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { answersApi } from '~/lib/api/answers';
import { clearAskDraft, readAskDraft, writeAskDraft } from '~/lib/ask-draft';
import { conversationsApi } from '~/lib/api/conversations';
import { queryKeys } from '~/lib/api/query-keys';
import { ALL_DOCUMENTS, resolveDocumentScope } from '~/lib/document-scope';
import { formatDateTime } from '~/lib/format';
import { pageHead } from '~/lib/seo';
import { questionSchema } from '~/lib/validation';

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
  ): {
    answer?: string;
    q?: string;
    documentId?: string;
    conversation?: string;
  } => ({
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
    conversation:
      typeof search.conversation === 'string' &&
      search.conversation.trim().length > 0
        ? search.conversation
        : undefined,
  }),
  component: AskPage,
});

const SUGGESTED_QUESTIONS = [
  'Summarize the key points in these documents.',
  'What policies should every new employee know?',
  'What are the most important deadlines or dates?',
];

function AskPage() {
  const { organizationId } = Route.useParams();
  const {
    answer: permalinkAnswerId,
    q: presetQuestion,
    documentId: presetDocumentId,
    conversation: presetConversationId,
  } = Route.useSearch();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { toast } = useToast();
  const [question, setQuestion] = useState(
    () =>
      presetQuestion ??
      readAskDraft(organizationId, presetConversationId),
  );
  const [selection, setSelection] = useState(
    presetDocumentId ?? ALL_DOCUMENTS,
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(presetConversationId ?? null);
  const [asked, setAsked] = useState<AskedQuestion | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(
    null,
  );
  const [showConversations, setShowConversations] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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

  const activeConversationDetail = useQuery({
    queryKey: queryKeys.organizations.conversations.detail(
      organizationId,
      activeConversationId ?? '',
    ),
    queryFn: () =>
      conversationsApi.detail(organizationId, activeConversationId ?? ''),
    enabled: activeConversationId !== null,
    staleTime: 30_000,
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
        updateConversationSearch(conversationId);
      } catch {
        return;
      }
    }

    setAsked({
      question: questionText,
      documentId: scope.documentId,
      scopeLabel: scope.label,
    });
    clearAskDraft(organizationId, activeConversationId ?? undefined);
    clearAskDraft(organizationId, conversationId);
    setQuestion('');

    await stream.ask(questionText, scope.documentId, conversationId);
  }

  function updateConversationSearch(conversationId: string | undefined) {
    void navigate({
      to: '/organizations/$organizationId/ask',
      params: { organizationId },
      search: {
        ...search,
        conversation: conversationId,
        answer: undefined,
      },
      replace: true,
    });
  }

  function startNewConversation() {
    stream.reset();
    setAsked(null);
    setActiveConversationId(null);
    updateConversationSearch(undefined);
    setQuestion(readAskDraft(organizationId));
    setValidationError(null);
    setShowConversations(false);
  }

  function selectConversation(conversationId: string) {
    if (conversationId === activeConversationId) {
      setShowConversations(false);
      return;
    }

    stream.reset();
    setAsked(null);
    setActiveConversationId(conversationId);
    updateConversationSearch(conversationId);
    setQuestion(readAskDraft(organizationId, conversationId));
    setValidationError(null);
    setShowConversations(false);
  }

  function changeQuestion(value: string) {
    setQuestion(value);
    writeAskDraft(
      organizationId,
      activeConversationId ?? undefined,
      value,
    );
  }

  function applySuggestion(suggestion: string) {
    changeQuestion(suggestion);
    window.requestAnimationFrame(() => {
      document.getElementById('ask-question')?.focus();
    });
  }

  async function handleDelete() {
    if (deleteTarget === null) {
      return;
    }

    try {
      await removeConversation.mutateAsync(deleteTarget.id);
      clearAskDraft(organizationId, deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      return;
    }
  }

  const streaming = stream.status === 'streaming';
  const conversationRows = useMemo(
    () =>
      conversations.data?.pages.flatMap((page) => page.conversations) ?? [],
    [conversations.data],
  );
  const activeConversation = useMemo(
    () =>
      conversationRows.find(
        (conversation) => conversation.id === activeConversationId,
      ),
    [conversationRows, activeConversationId],
  );
  const conversationTitle =
    activeConversation?.title?.trim() ||
    activeConversationDetail.data?.conversation.title?.trim() ||
    'New conversation';
  const heading =
    activeConversationId === null ? 'Ask a question' : conversationTitle;
  const subtitle =
    activeConversationId === null
      ? 'Answers are grounded in your documents and cite their sources.'
      : 'Follow-ups keep the context of this conversation.';

  return (
    <div className="space-y-6">
      {permalinkAnswerId !== undefined ? (
        <PermalinkAnswer
          organizationId={organizationId}
          answerId={permalinkAnswerId}
        />
      ) : null}

      <div className="grid h-[calc(100dvh-12rem)] grid-cols-1 overflow-hidden rounded-xl border bg-card shadow-sm sm:h-[calc(100dvh-14.5rem)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 min-w-0 border-r bg-muted/20 lg:block">
          <ConversationRail
            conversations={conversationRows}
            activeConversationId={activeConversationId}
            listId="conversation-list"
            isPending={conversations.isPending}
            isError={conversations.isError}
            error={conversations.error}
            hasNextPage={conversations.hasNextPage}
            isFetchingNextPage={conversations.isFetchingNextPage}
            onRetry={() => void conversations.refetch()}
            onFetchNextPage={() => void conversations.fetchNextPage()}
            onNew={startNewConversation}
            onSelect={selectConversation}
            onDelete={(conversation) => {
              removeConversation.reset();
              setDeleteTarget(conversation);
            }}
            onOpenHistory={() => setShowHistory(true)}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2 sm:px-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Conversations"
              className="lg:hidden"
              onClick={() => setShowConversations(true)}
            >
              <PanelLeft className="size-4" />
            </Button>

            <div className="min-w-0 flex-1 px-1">
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {heading}
              </h1>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block sm:text-xs">
                {subtitle}
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              className="lg:hidden"
              onClick={startNewConversation}
            >
              <SquarePen className="size-4" />
            </Button>
          </div>

          {activeConversationId === null ? (
            <EmptyConversation
              organizationId={organizationId}
              documentsCount={ready.documents.length}
              documentsPending={ready.query.isPending}
              onSuggestion={applySuggestion}
            />
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

          <AskComposer
            organizationId={organizationId}
            documents={ready.documents}
            documentId={scope.documentId}
            question={question}
            onQuestionChange={changeQuestion}
            onDocumentChange={setSelection}
            onSubmit={() => void submit()}
            onStop={stream.cancel}
            streaming={streaming}
            submitting={createConversation.isPending}
            documentsPending={ready.query.isPending}
            validationError={validationError}
            streamError={stream.error}
            createError={createConversation.error}
          />
        </div>
      </div>

      <Dialog open={showConversations} onOpenChange={setShowConversations}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <DialogTitle className="text-base">Conversations</DialogTitle>
            <DialogDescription className="sr-only">
              Switch to another conversation or start a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <ConversationRail
              conversations={conversationRows}
              activeConversationId={activeConversationId}
              listId="conversation-list-mobile"
              showHeading={false}
              isPending={conversations.isPending}
              isError={conversations.isError}
              error={conversations.error}
              hasNextPage={conversations.hasNextPage}
              isFetchingNextPage={conversations.isFetchingNextPage}
              onRetry={() => void conversations.refetch()}
              onFetchNextPage={() => void conversations.fetchNextPage()}
              onNew={startNewConversation}
              onSelect={selectConversation}
              onDelete={(conversation) => {
                removeConversation.reset();
                setDeleteTarget(conversation);
              }}
              onOpenHistory={() => {
                setShowConversations(false);
                setShowHistory(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-6">
            <DialogTitle className="text-base">Question history</DialogTitle>
            <DialogDescription className="sr-only">
              Browse the questions asked in this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <AnswerThread organizationId={organizationId} />
          </div>
        </DialogContent>
      </Dialog>

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

function EmptyConversation({
  organizationId,
  documentsCount,
  documentsPending,
  onSuggestion,
}: Readonly<{
  organizationId: string;
  documentsCount: number;
  documentsPending: boolean;
  onSuggestion: (suggestion: string) => void;
}>) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
        <div className="my-auto max-w-xl">
          <div className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand/10">
            <MessageSquareText className="size-5 text-brand" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight sm:text-xl">
            Ask your documents anything
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {documentsCount > 0
              ? `Search ${countLabel(documentsCount)} and get an answer with the pages it came from.`
              : 'Upload a document and get answers grounded in its contents, with citations.'}
          </p>

          {documentsPending ? (
            <Skeleton className="mt-6 h-24 w-full rounded-xl" />
          ) : documentsCount > 0 ? (
            <div className="mt-6 space-y-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Try asking
              </p>
              <div className="grid gap-2">
                {SUGGESTED_QUESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSuggestion(suggestion)}
                    className="group flex items-center justify-between gap-3 rounded-lg border bg-background px-3.5 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span>{suggestion}</span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Button asChild variant="outline" className="mt-5">
              <Link
                to="/organizations/$organizationId/documents"
                params={{ organizationId }}
              >
                Upload a document first
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function countLabel(count: number): string {
  return count === 1 ? '1 ready document' : `${count} ready documents`;
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
      <CardContent className="space-y-4 p-4 sm:p-6">
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
        {detail.isError ? (
          <ErrorNotice
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />
        ) : null}
        {detail.data ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{detail.data.answer.question}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(detail.data.answer.createdAt)}
              </p>
            </div>
            {detail.data.answer.status === 'answered' ? (
              <AnswerBody
                text={detail.data.answer.answer ?? ''}
                sourceIdPrefix={`shared-${answerId}`}
              />
            ) : (
              <InsufficientEvidence />
            )}
            {detail.data.answer.citations.length > 0 ? (
              <SourcesList
                citations={detail.data.answer.citations}
                organizationId={organizationId}
                sourceIdPrefix={`shared-${answerId}`}
              />
            ) : null}
            <div className="flex justify-end gap-1">
              <AnswerFeedback
                organizationId={organizationId}
                answerId={detail.data.answer.id}
                initial={detail.data.answer.feedback}
              />
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

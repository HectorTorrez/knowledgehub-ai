import { collectionsApi } from '~/lib/api/collections';
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
  Download,
  MessageSquareText,
  PanelLeft,
  SquarePen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnswerActions, AnswerFeedback } from '~/components/answer-actions';
import {
  AnswerBody,
  InsufficientEvidence,
  PartialAnswerNotice,
  SourcesList,
} from '~/components/answer-content';
import { AskComposer } from '~/components/ask-composer';
import {
  ConversationMessages,
  type AskedQuestion,
} from '~/components/ask-messages';
import { AnswerThread } from '~/components/answer-thread';
import { ConversationRail } from '~/components/conversation-rail';
import { ConversationShare } from '~/components/conversation-share';
import { Button, buttonVariants } from '~/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Card, CardContent } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Skeleton } from '~/components/ui/skeleton';
import { RouteError } from '~/components/route-states';
import { Textarea } from '~/components/ui/textarea';
import { useToast } from '~/components/ui/toast';
import { useAnswerStream } from '~/hooks/use-answer-stream';
import { useQueryErrorToast, useReportError } from '~/hooks/use-error-toast';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { answersApi } from '~/lib/api/answers';
import { clearAskDraft, readAskDraft, writeAskDraft } from '~/lib/ask-draft';
import { conversationsApi } from '~/lib/api/conversations';
import { queryKeys } from '~/lib/api/query-keys';
import {
  ALL_DOCUMENTS,
  collectionSelection,
  selectedCollectionId,
  resolveDocumentScope,
} from '~/lib/document-scope';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/provider';
import { createTranslator } from '~/lib/i18n/translate';
import { pageHead } from '~/lib/seo';
import { questionSchema } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/ask',
)({
  head: ({ match }) => {
    const t = createTranslator(match.context.locale);
    return pageHead({
      title: t('ask.pageTitle'),
      description: t('ask.pageDescription'),
    });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    answer?: string;
    q?: string;
    documentId?: string;
    collectionId?: string;
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
      typeof search.documentId === 'string' &&
      search.documentId.trim().length > 0
        ? search.documentId
        : undefined,
    collectionId:
      typeof search.collectionId === 'string' ? search.collectionId : undefined,
    conversation:
      typeof search.conversation === 'string' &&
      search.conversation.trim().length > 0
        ? search.conversation
        : undefined,
  }),
  component: AskPage,
});

const SUGGESTED_QUESTIONS = [
  'ask.suggestions.summarize',
  'ask.suggestions.policies',
  'ask.suggestions.deadlines',
] as const;

function AskPage() {
  const t = useT();
  const { organizationId } = Route.useParams();
  const {
    answer: permalinkAnswerId,
    q: presetQuestion,
    documentId: presetDocumentId,
    collectionId: presetCollectionId,
    conversation: presetConversationId,
  } = Route.useSearch();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { toast } = useToast();
  const [question, setQuestion] = useState(
    () => presetQuestion ?? readAskDraft(organizationId, presetConversationId),
  );
  const [selection, setSelection] = useState(
    presetCollectionId
      ? collectionSelection(presetCollectionId)
      : (presetDocumentId ?? ALL_DOCUMENTS),
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(presetConversationId ?? null);
  const [asked, setAsked] = useState<AskedQuestion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(
    null,
  );
  const [showConversations, setShowConversations] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversationScope, setConversationScope] = useState<
    'all' | 'mine' | 'shared'
  >('all');

  useEffect(() => {
    setActiveConversationId(presetConversationId ?? null);
    setQuestion(
      presetQuestion ?? readAskDraft(organizationId, presetConversationId),
    );
  }, [organizationId, presetConversationId, presetQuestion]);

  useEffect(() => {
    setSelection(
      presetCollectionId
        ? collectionSelection(presetCollectionId)
        : (presetDocumentId ?? ALL_DOCUMENTS),
    );
  }, [organizationId, presetCollectionId, presetDocumentId]);

  const ready = useReadyDocuments(organizationId);
  const collections = useQuery({
    queryKey: queryKeys.organizations.collections(organizationId),
    queryFn: () => collectionsApi.list(organizationId),
  });
  const collectionId = selectedCollectionId(selection);
  const selectedCollection = (collections.data ?? []).find(
    (item) => item.id === collectionId,
  );
  const scope = selectedCollection
    ? { documentId: undefined, label: `“${selectedCollection.name}”` }
    : collectionId
      ? { documentId: undefined, label: t('ask.scopeCollection') }
      : resolveDocumentScope(
          selection,
          ready.documents,
          t('ask.scopeAllDocuments'),
        );
  const stream = useAnswerStream(organizationId);
  const reportError = useReportError();

  const conversations = useInfiniteQuery({
    queryKey: queryKeys.organizations.conversations.list(
      organizationId,
      conversationScope,
    ),
    queryFn: ({ pageParam }) =>
      conversationsApi.list(organizationId, {
        cursor: pageParam,
        limit: 25,
        scope: conversationScope,
      }),
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
  useQueryErrorToast(collections.error, () => void collections.refetch());
  useQueryErrorToast(ready.query.error, () => void ready.query.refetch());
  useQueryErrorToast(conversations.error, () => void conversations.refetch());
  useQueryErrorToast(
    activeConversationDetail.error,
    () => void activeConversationDetail.refetch(),
  );
  useQueryErrorToast(stream.error);

  const createConversation = useMutation({
    mutationFn: () => conversationsApi.create(organizationId),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.conversations.list(organizationId),
      }),
    onError: (error) => reportError(error),
  });

  const removeConversation = useMutation({
    mutationFn: (conversationId: string) =>
      conversationsApi.remove(organizationId, conversationId),
    onSuccess: (_data, conversationId) => {
      if (activeConversationId === conversationId) {
        startNewConversation();
      }

      toast({ variant: 'success', title: t('ask.conversationDeleted') });

      return client.invalidateQueries({
        queryKey: queryKeys.organizations.conversations.all(organizationId),
      });
    },
    onError: (error) => reportError(error),
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

    const result = questionSchema(t).safeParse({ question });

    if (!result.success) {
      reportError(
        new Error(
          result.error.issues[0]?.message ?? t('validation.questionRequired'),
        ),
      );
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

    await stream.ask(
      questionText,
      scope.documentId,
      conversationId,
      collectionId ? [collectionId] : undefined,
    );
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
    setShowConversations(false);
  }

  function changeQuestion(value: string) {
    setQuestion(value);
    writeAskDraft(organizationId, activeConversationId ?? undefined, value);
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
    () => conversations.data?.pages.flatMap((page) => page.conversations) ?? [],
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
    t('ask.newConversation');
  const heading =
    activeConversationId === null ? t('ask.title') : conversationTitle;
  const subtitle =
    activeConversationId === null
      ? t('ask.subtitleNew')
      : t('ask.subtitleFollowUp');

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
      {activeConversationDetail.isError ? (
        <RouteError
          title={t('ask.conversationLoadError')}
          onRetry={() => void activeConversationDetail.refetch()}
        />
      ) : null}
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
            scope={conversationScope}
            onScopeChange={setConversationScope}
            activeConversationId={activeConversationId}
            listId="conversation-list"
            isPending={conversations.isPending}
            isError={conversations.isError}
            onRetry={() => void conversations.refetch()}
            hasNextPage={conversations.hasNextPage}
            isFetchingNextPage={conversations.isFetchingNextPage}
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
              aria-label={t('ask.conversations')}
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

            {activeConversationDetail.data?.conversation ? (
              <ConversationShare
                organizationId={organizationId}
                conversation={activeConversationDetail.data.conversation}
              />
            ) : null}

            {activeConversationId !== null && (
              <Button
                variant="ghost"
                onClick={() => {
                  void conversationsApi
                    .export(organizationId, activeConversationId)
                    .catch(() => {
                      toast({
                        variant: 'error',
                        title: t('ask.exportError'),
                      });
                    });
                }}
              >
                <Download className="size-4" /> {t('ask.exportConversation')}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              aria-label={t('ask.newConversation')}
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
                missing: stream.missing,
                citations: stream.citations,
              }}
            />
          )}

          {activeConversationDetail.data?.conversation.canEdit === false ? (
            <div className="space-y-2 border-t p-4 text-sm">
              <Textarea
                aria-label={t('ask.yourQuestion')}
                disabled
                placeholder={t('ask.readOnly')}
              />
              <p>
                {t('ask.onlyCreator', {
                  name:
                    activeConversationDetail.data.conversation.createdBy
                      ?.firstName ?? t('ask.theCreator'),
                })}
              </p>
              <Button
                onClick={() => {
                  writeAskDraft(organizationId, undefined, question);
                  startNewConversation();
                  window.requestAnimationFrame(() =>
                    document.getElementById('ask-question')?.focus(),
                  );
                }}
              >
                {t('ask.followUpNew')}
              </Button>
            </div>
          ) : (
            <AskComposer
              organizationId={organizationId}
              documents={ready.documents}
              selection={selection}
              collections={collections.data ?? []}
              question={question}
              onQuestionChange={changeQuestion}
              onDocumentChange={(value) => {
                setSelection(value);
                void navigate({
                  to: '/organizations/$organizationId/ask',
                  params: { organizationId },
                  search: {
                    ...search,
                    documentId:
                      value !== ALL_DOCUMENTS && !selectedCollectionId(value)
                        ? value
                        : undefined,
                    collectionId: selectedCollectionId(value),
                  },
                  replace: true,
                });
              }}
              onSubmit={() => void submit()}
              onStop={stream.cancel}
              streaming={streaming}
              submitting={createConversation.isPending}
              documentsPending={ready.query.isPending}
            />
          )}
        </div>
      </div>

      <Dialog open={showConversations} onOpenChange={setShowConversations}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <DialogTitle className="text-base">
              {t('ask.conversations')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('ask.switchConversation')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <ConversationRail
              conversations={conversationRows}
              scope={conversationScope}
              onScopeChange={setConversationScope}
              activeConversationId={activeConversationId}
              listId="conversation-list-mobile"
              showHeading={false}
              isPending={conversations.isPending}
              isError={conversations.isError}
              onRetry={() => void conversations.refetch()}
              hasNextPage={conversations.hasNextPage}
              isFetchingNextPage={conversations.isFetchingNextPage}
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
            <DialogTitle className="text-base">{t('ask.history')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('ask.historyDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <AnswerThread organizationId={organizationId} />
          </div>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>{t('ask.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ask.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={removeConversation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {removeConversation.isPending
                ? t('documents.deleting')
                : t('documents.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const t = useT();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
        <div className="my-auto max-w-xl">
          <div className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand/10">
            <MessageSquareText className="size-5 text-brand" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight sm:text-xl">
            {t('ask.emptyTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {documentsCount > 0
              ? t('ask.emptySearch', { count: documentsCount })
              : t('ask.emptyUpload')}
          </p>

          {documentsPending ? (
            <Skeleton className="mt-6 h-24 w-full rounded-xl" />
          ) : documentsCount > 0 ? (
            <div className="mt-6 space-y-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {t('ask.tryAsking')}
              </p>
              <div className="grid gap-2">
                {SUGGESTED_QUESTIONS.map((suggestionKey) => {
                  const suggestion = t(suggestionKey);
                  return (
                    <Button
                      key={suggestionKey}
                      type="button"
                      variant="outline"
                      onClick={() => onSuggestion(suggestion)}
                      className="group h-auto sm:h-auto justify-between gap-3 rounded-lg px-3.5 py-3 text-left text-sm font-normal whitespace-normal"
                    >
                      <span>{suggestion}</span>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Button asChild variant="outline" className="mt-5">
              <Link
                to="/organizations/$organizationId/documents"
                params={{ organizationId }}
              >
                {t('ask.uploadFirst')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PermalinkAnswer({
  organizationId,
  answerId,
}: Readonly<{ organizationId: string; answerId: string }>) {
  const t = useT();
  const locale = useLocale();
  const detail = useQuery({
    queryKey: queryKeys.organizations.answers.detail(organizationId, answerId),
    queryFn: () => answersApi.detail(organizationId, answerId),
  });
  useQueryErrorToast(detail.error, () => void detail.refetch());

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('ask.sharedAnswer')}
          </p>
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/organizations/$organizationId/ask"
              params={{ organizationId }}
            >
              {t('documents.close')}
            </Link>
          </Button>
        </div>

        {detail.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {detail.isError ? (
          <RouteError
            title={t('ask.answerLoadError')}
            onRetry={() => void detail.refetch()}
          />
        ) : null}
        {detail.data ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {detail.data.answer.question}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(detail.data.answer.createdAt, locale)}
              </p>
            </div>
            {detail.data.answer.status !== 'insufficient_evidence' ? (
              <AnswerBody
                text={detail.data.answer.answer ?? ''}
                sourceIdPrefix={`shared-${answerId}`}
              />
            ) : (
              <InsufficientEvidence />
            )}
            {detail.data.answer.status === 'partial' ? (
              <PartialAnswerNotice missing={detail.data.answer.missing ?? []} />
            ) : null}
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
                missing={detail.data.answer.missing ?? []}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

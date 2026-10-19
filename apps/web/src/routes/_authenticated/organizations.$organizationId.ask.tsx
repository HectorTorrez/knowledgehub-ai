import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoaderCircle, Send } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { AnswerThread, type LatestAnswer } from '~/components/answer-thread';
import { AnswerBody } from '~/components/answer-content';
import { DocumentScopeSelect } from '~/components/document-scope-select';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useAnswerStream } from '~/hooks/use-answer-stream';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { queryKeys } from '~/lib/api/query-keys';
import { ALL_DOCUMENTS, resolveDocumentScope } from '~/lib/document-scope';
import { pageHead } from '~/lib/seo';
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
  component: AskPage,
});

interface AskedQuestion {
  question: string;
  documentId: string | undefined;
  scopeLabel: string;
}

function AskPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [question, setQuestion] = useState('');
  const [selection, setSelection] = useState(ALL_DOCUMENTS);
  const [asked, setAsked] = useState<AskedQuestion | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const ready = useReadyDocuments(organizationId);
  const scope = resolveDocumentScope(selection, ready.documents);
  const stream = useAnswerStream(organizationId);

  useEffect(() => {
    if (stream.status !== 'done') {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    answerRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });

    void client.invalidateQueries({
      queryKey: queryKeys.organizations.answers.list(organizationId),
    });
  }, [stream.status, client, organizationId]);

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
    setAsked({
      question: questionText,
      documentId: scope.documentId,
      scopeLabel: scope.label,
    });

    await stream.ask(questionText, scope.documentId);
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

  const streaming = stream.status === 'streaming';
  const awaitingFirstToken = streaming && stream.answerStatus === null;

  const latest: LatestAnswer | undefined =
    stream.status === 'done' && stream.answerStatus !== null && asked !== null
      ? {
          question: asked.question,
          response:
            stream.answerStatus === 'answered'
              ? {
                  status: 'answered',
                  answer: stream.text,
                  citations: stream.citations,
                }
              : {
                  status: 'insufficient_evidence',
                  answer: null,
                  citations: stream.citations,
                },
          scopeLabel: asked.scopeLabel,
        }
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ask a question"
        description="Answers are grounded in the documents you choose and cite their sources."
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {validationError ? (
              <ErrorNotice error={new Error(validationError)} />
            ) : null}
            {stream.status === 'error' ? (
              <ErrorNotice error={stream.error} />
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
                disabled={streaming || question.trim().length === 0}
              >
                {streaming ? (
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

      <div ref={answerRef} className="scroll-mt-20 space-y-8">
        {awaitingFirstToken && asked !== null ? (
          <ThinkingCard question={asked.question} scopeLabel={asked.scopeLabel} />
        ) : null}

        {streaming && !awaitingFirstToken ? (
          <StreamingAnswerCard text={stream.text} />
        ) : null}

        <AnswerThread organizationId={organizationId} latest={latest} />
      </div>
    </div>
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

function ThinkingCard({
  question,
  scopeLabel,
}: Readonly<{ question: string; scopeLabel: string }>) {
  return (
    <Card>
      <CardContent role="status" aria-live="polite" className="space-y-2 p-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Question
        </p>
        <p className="text-sm font-medium">{question}</p>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Searching {scopeLabel}…
        </span>
      </CardContent>
    </Card>
  );
}

function StreamingAnswerCard({ text }: Readonly<{ text: string }>) {
  return (
    <Card>
      <CardContent role="status" aria-live="polite" className="space-y-3 p-6">
        <AnswerBody text={text} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Writing…
        </p>
      </CardContent>
    </Card>
  );
}

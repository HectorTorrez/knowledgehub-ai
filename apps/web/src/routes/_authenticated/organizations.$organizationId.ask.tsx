import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { DocumentScopeSelect } from '~/components/document-scope-select';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useReadyDocuments } from '~/hooks/use-ready-documents';
import { answerFor, answersApi } from '~/lib/api/answers';
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

function AskPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [question, setQuestion] = useState('');
  const [selection, setSelection] = useState(ALL_DOCUMENTS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const ready = useReadyDocuments(organizationId);
  const scope = resolveDocumentScope(selection, ready.documents);

  const ask = useMutation({
    mutationFn: (input: {
      organizationId: string;
      question: string;
      documentId?: string;
    }) =>
      answersApi.ask(input.organizationId, input.question, input.documentId),
    onSuccess: (_data, variables) =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.list(variables.organizationId),
      }),
  });

  useEffect(() => {
    if (ask.data) {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      answerRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [ask.data]);

  async function submit() {
    setValidationError(null);

    const result = questionSchema.safeParse({ question });

    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Enter a question.');
      return;
    }

    try {
      await ask.mutateAsync({
        organizationId,
        question: result.data.question,
        documentId: scope.documentId,
      });
      setQuestion('');
    } catch {
      return;
    }
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

  const answer = answerFor(ask.variables, ask.data, organizationId);
  const askedScope = resolveDocumentScope(
    ask.variables?.documentId ?? ALL_DOCUMENTS,
    ready.documents,
  );
  const latest: LatestAnswer | undefined = answer
    ? {
        question: ask.variables?.question ?? '',
        response: answer,
        scopeLabel: askedScope.label,
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
            {ask.isError ? <ErrorNotice error={ask.error} /> : null}

            <div className="space-y-2">
              <Label htmlFor="document-scope">Answer from</Label>
              <DocumentScopeSelect
                documents={ready.documents}
                value={scope.documentId ?? ALL_DOCUMENTS}
                onValueChange={setSelection}
                disabled={ready.query.isPending}
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
                disabled={ask.isPending || question.trim().length === 0}
              >
                {ask.isPending ? (
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
        {ask.isPending ? (
          <ThinkingCard
            question={ask.variables?.question ?? ''}
            scopeLabel={scope.label}
          />
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

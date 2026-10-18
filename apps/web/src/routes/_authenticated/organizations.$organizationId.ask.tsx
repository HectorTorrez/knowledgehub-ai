import type { AnswerCitation, AnswerResponse } from '@knowledgehub/shared-types';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoaderCircle, SearchX, Send } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { answerFor, answersApi } from '~/lib/api/answers';
import { questionSchema, QUESTION_MAX_LENGTH } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/ask',
)({
  component: AskPage,
});

function AskPage() {
  const { organizationId } = Route.useParams();
  const [question, setQuestion] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (input: { organizationId: string; question: string }) =>
      answersApi.ask(input.organizationId, input.question),
  });

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
      });
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ask a question"
        description="Answers are grounded in this organization's ready documents and cite their sources."
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {validationError ? (
              <ErrorNotice error={new Error(validationError)} />
            ) : null}
            {ask.isError ? <ErrorNotice error={ask.error} /> : null}
            <div className="space-y-2">
              <Label htmlFor="question">Your question</Label>
              <Textarea
                id="question"
                rows={4}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What is the parental leave policy?"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
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

      {ask.isPending ? <ThinkingCard /> : null}

      {answer ? (
        <AnswerSection question={ask.variables?.question ?? ''} answer={answer} />
      ) : null}
    </div>
  );
}

function ThinkingCard() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Searching this organization&apos;s documents…
      </CardContent>
    </Card>
  );
}

function AnswerSection({
  question,
  answer,
}: Readonly<{ question: string; answer: AnswerResponse }>) {
  return (
    <div className="space-y-4">
      {question ? (
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Question
          </p>
          <p className="text-sm font-medium">{question}</p>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-6">
          {answer.status === 'answered' ? (
            <AnswerBody text={answer.answer} />
          ) : (
            <InsufficientEvidence />
          )}
        </CardContent>
      </Card>

      {answer.citations.length > 0 ? (
        <SourcesList citations={answer.citations} />
      ) : null}
    </div>
  );
}

function AnswerBody({ text }: Readonly<{ text: string }>) {
  const parts = text.split(/(\[\d+\])/g);

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);

        if (match) {
          return <CitationMarker key={index} marker={Number(match[1])} />;
        }

        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

function CitationMarker({ marker }: Readonly<{ marker: number }>) {
  return (
    <a
      href={`#source-${marker}`}
      aria-label={`Go to source ${marker}`}
      className="mx-0.5 inline-flex h-4 min-w-4 translate-y-[-1px] items-center justify-center rounded-sm bg-primary/10 px-1 align-middle text-[10px] leading-none font-semibold text-primary transition-colors hover:bg-primary/20"
    >
      {marker}
    </a>
  );
}

function InsufficientEvidence() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium">Not enough evidence</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The uploaded documents don&apos;t contain enough information to answer
          this question.
        </p>
      </div>
    </div>
  );
}

function SourcesList({
  citations,
}: Readonly<{ citations: AnswerCitation[] }>) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Sources</h3>
      <ol className="space-y-3">
        {citations.map((citation) => (
          <li
            key={`${citation.documentId}-${citation.chunkIndex}`}
            id={`source-${citation.marker}`}
            className="scroll-mt-20 rounded-lg border p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">
                {citation.marker}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {citation.documentTitle}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                Page {citation.pageNumber}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {citation.excerpt}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

import type { AnswerCitation } from '@knowledgehub/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoaderCircle, Send, Sparkles } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnswerHistory } from '~/components/answer-history';
import {
  AnswerBody,
  CopyButton,
  InsufficientEvidence,
  SourcesList,
} from '~/components/answer-content';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useAnswerStream } from '~/hooks/use-answer-stream';
import { queryKeys } from '~/lib/api/query-keys';
import { questionSchema, QUESTION_MAX_LENGTH } from '~/lib/validation';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/ask',
)({
  component: AskPage,
});

const SUGGESTED_QUESTIONS = [
  'Summarize the key points across my documents.',
  'What are the main policies?',
  'Find any deadlines or dates mentioned.',
];

function AskPage() {
  const { organizationId } = Route.useParams();
  const client = useQueryClient();
  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const stream = useAnswerStream(organizationId);

  async function submit(value: string) {
    if (stream.status === 'streaming') {
      return;
    }

    setValidationError(null);

    const result = questionSchema.safeParse({ question: value });
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Enter a question.');
      return;
    }

    const questionText = result.data.question;
    setAskedQuestion(questionText);
    await stream.ask(questionText);
    await client.invalidateQueries({
      queryKey: queryKeys.organizations.answers.list(organizationId),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(question);
    }
  }

  const streaming = stream.status === 'streaming';
  const awaitingFirstToken = streaming && stream.answerStatus === null;
  const showSuggestions =
    !streaming && askedQuestion === '' && question.trim().length === 0;

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
            {stream.status === 'error' ? (
              <ErrorNotice error={stream.error} />
            ) : null}
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

      {showSuggestions ? (
        <SuggestionList
          onSelect={(suggestion) => setQuestion(suggestion)}
        />
      ) : null}

      {streaming ? (
        awaitingFirstToken ? (
          <ThinkingCard />
        ) : (
          <StreamingAnswerCard text={stream.text} />
        )
      ) : null}

      {!streaming && askedQuestion !== '' ? (
        <AnswerSection
          question={askedQuestion}
          status={stream.answerStatus}
          text={stream.text}
          citations={stream.citations}
        />
      ) : null}

      <AnswerHistory organizationId={organizationId} />
    </div>
  );
}

function SuggestionList({
  onSelect,
}: Readonly<{ onSelect: (question: string) => void }>) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5" />
        Try asking
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
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

function StreamingAnswerCard({ text }: Readonly<{ text: string }>) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <AnswerBody text={text} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Writing…
        </p>
      </CardContent>
    </Card>
  );
}

function AnswerSection({
  question,
  status,
  text,
  citations,
}: Readonly<{
  question: string;
  status: 'answered' | 'insufficient_evidence' | null;
  text: string;
  citations: AnswerCitation[];
}>) {
  if (status === null) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Question
        </p>
        <p className="text-sm font-medium">{question}</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            {status === 'answered' ? (
              <div className="min-w-0 flex-1">
                <AnswerBody text={text} />
              </div>
            ) : (
              <InsufficientEvidence />
            )}
            {status === 'answered' ? <CopyButton text={text} /> : null}
          </div>
        </CardContent>
      </Card>

      {status === 'answered' && citations.length > 0 ? (
        <SourcesList citations={citations} />
      ) : null}
    </div>
  );
}

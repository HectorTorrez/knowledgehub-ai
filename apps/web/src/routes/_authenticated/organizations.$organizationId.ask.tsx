import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '~/components/route-states';
import { answersApi, answerFor } from '~/lib/api/answers';
import { questionSchema } from '~/lib/validation';

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  const answer = answerFor(ask.variables, ask.data, organizationId);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Ask a question</h2>
        <p className="text-sm text-muted-foreground">
          Answers are grounded in this organization&apos;s ready documents and
          include the sources they cite.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {validationError ? <ErrorNotice error={new Error(validationError)} /> : null}
          {ask.isError ? <ErrorNotice error={ask.error} /> : null}
          <textarea
            aria-label="Question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder="What is the parental leave policy?"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={ask.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {ask.isPending ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      </section>

      {answer ? (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Answer</h2>
          {answer.status === 'answered' ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {answer.answer}
            </p>
          ) : (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Not enough evidence</p>
              <p className="mt-1 text-muted-foreground">
                The uploaded documents do not contain enough information to answer
                this question.
              </p>
            </div>
          )}

          {answer.citations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Sources</h3>
              <ol className="space-y-2">
                {answer.citations.map((citation) => (
                  <li
                    key={`${citation.documentId}-${citation.chunkIndex}`}
                    className="rounded-md border p-3 text-sm"
                  >
                    <p className="font-medium">
                      [{citation.marker}] {citation.documentTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Page {citation.pageNumber}
                    </p>
                    <p className="mt-1 text-muted-foreground">{citation.excerpt}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

import type { DocumentSummary } from '@knowledgehub/shared-types';
import { Link } from '@tanstack/react-router';
import { ArrowUp, LoaderCircle, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { DocumentScopeSelect } from '~/components/document-scope-select';
import { ErrorNotice } from '~/components/route-states';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ALL_DOCUMENTS } from '~/lib/document-scope';
import { QUESTION_MAX_LENGTH } from '~/lib/validation';

export function AskComposer({
  organizationId,
  documents,
  documentId,
  question,
  onQuestionChange,
  onDocumentChange,
  onSubmit,
  onStop,
  streaming,
  submitting,
  documentsPending,
  validationError,
  streamError,
  createError,
}: Readonly<{
  organizationId: string;
  documents: DocumentSummary[];
  documentId: string | undefined;
  question: string;
  onQuestionChange: (value: string) => void;
  onDocumentChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  submitting: boolean;
  documentsPending: boolean;
  validationError: string | null;
  streamError: unknown;
  createError: unknown;
}>) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.key !== 'Enter' ||
      event.shiftKey
    ) {
      return;
    }

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return;
    }

    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="shrink-0 border-t bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 sm:py-4">
      <form
        aria-label="Ask a question"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="mx-auto w-full max-w-3xl space-y-2"
      >
        {validationError ? (
          <ErrorNotice error={new Error(validationError)} />
        ) : null}
        {streamError ? <ErrorNotice error={streamError} /> : null}
        {createError ? <ErrorNotice error={createError} /> : null}

        <div className="rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          <Textarea
            id="ask-question"
            aria-label="Your question"
            rows={1}
            maxLength={QUESTION_MAX_LENGTH}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about these documents…"
            className="field-sizing-content max-h-40 min-h-12 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <DocumentScopeSelect
              variant="compact"
              documents={documents}
              value={documentId ?? ALL_DOCUMENTS}
              onValueChange={onDocumentChange}
              disabled={documentsPending || streaming}
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {question.length}/{QUESTION_MAX_LENGTH}
              </span>
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="rounded-full"
                  onClick={onStop}
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Ask"
                  className="rounded-full"
                  disabled={submitting || question.trim().length === 0}
                >
                  {submitting ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <ArrowUp />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
          {documents.length === 0 && !documentsPending ? (
            <p>
              No documents are ready.{' '}
              <Link
                to="/organizations/$organizationId/documents"
                params={{ organizationId }}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Upload one
              </Link>{' '}
              to ask questions.
            </p>
          ) : (
            <p className="hidden sm:block">
              Enter to send · Shift+Enter for a new line
            </p>
          )}
          <p className="sm:hidden">Tap Ask to send</p>
        </div>
      </form>
    </div>
  );
}

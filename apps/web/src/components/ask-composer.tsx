import type { DocumentSummary } from '@knowledgehub/shared-types';
import { Link } from '@tanstack/react-router';
import { ArrowUp, Mic, Pencil, Square, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { DocumentScopeSelect } from '~/components/document-scope-select';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { useSlashFocus } from '~/hooks/use-slash-focus';
import { useQuestionDictation } from '~/lib/use-question-dictation';
import { QUESTION_MAX_LENGTH } from '~/lib/validation';

import { useT } from '~/lib/i18n/hooks';

export function AskComposer({
  organizationId,
  documents,
  selection,
  collections,
  draftScope,
  question,
  onQuestionChange,
  onDocumentChange,
  onSubmit,
  onStop,
  editing = false,
  onCancelEdit,
  streaming,
  submitting,
  documentsPending,
}: Readonly<{
  editing?: boolean;
  onCancelEdit?: () => void;
  organizationId: string;
  documents: DocumentSummary[];
  selection: string;
  collections: { id: string; name: string }[];
  draftScope: string;
  question: string;
  onQuestionChange: (value: string) => void;
  onDocumentChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  submitting: boolean;
  documentsPending: boolean;
}>) {
  const t = useT();
  const questionRef = useRef<HTMLTextAreaElement>(null);
  useSlashFocus(questionRef);
  const dictation = useQuestionDictation(
    draftScope,
    question,
    onQuestionChange,
  );
  const busy = streaming || submitting;
  const canSubmit =
    !busy &&
    dictation.status !== 'listening' &&
    dictation.status !== 'finishing';

  function submitQuestion() {
    if (canSubmit) {
      onSubmit();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && editing) {
      event.preventDefault();
      onCancelEdit?.();
      return;
    }

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
    submitQuestion();
  }

  return (
    <div className="shrink-0 border-t bg-background/95 px-3 pt-2.5 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 md:py-4">
      <form
        aria-label={t('ask.title')}
        onSubmit={(event) => {
          event.preventDefault();
          submitQuestion();
        }}
        className="mx-auto w-full max-w-3xl space-y-2"
      >
        <div className="rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          {editing ? (
            <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
              <Pencil className="size-3.5 shrink-0" />
              <p className="min-w-0 flex-1">{t('composer.editing')}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 rounded-full"
                aria-label={t('composer.cancelEdit')}
                title={t('composer.cancelEdit')}
                onClick={onCancelEdit}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : null}
          <Textarea
            id="ask-question"
            ref={questionRef}
            aria-label={t('ask.yourQuestion')}
            rows={1}
            maxLength={QUESTION_MAX_LENGTH}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('composer.placeholder')}
            className="field-sizing-content max-h-40 min-h-12 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <DocumentScopeSelect
              variant="compact"
              documents={documents}
              collections={collections}
              value={selection}
              onValueChange={onDocumentChange}
              disabled={documentsPending || streaming}
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {question.length}/{QUESTION_MAX_LENGTH}
              </span>
              <DictationButton dictation={dictation} disabled={busy} />
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  aria-label={t('composer.stop')}
                  title={t('composer.stop')}
                  className="rounded-full"
                  onClick={onStop}
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label={t('composer.ask')}
                  className="rounded-full"
                  disabled={!canSubmit || question.trim().length === 0}
                >
                  {submitting ? <Spinner /> : <ArrowUp />}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div
          role="status"
          className={
            dictation.status === 'idle'
              ? 'sr-only'
              : 'px-1 text-xs text-muted-foreground'
          }
        >
          {dictation.status !== 'idle'
            ? t(`composer.voice.${dictation.status}`)
            : null}
        </div>

        {documents.length === 0 && !documentsPending ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            {t('composer.noDocumentsReady')}{' '}
            <Link
              to="/organizations/$organizationId/documents"
              params={{ organizationId }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t('composer.uploadOne')}
            </Link>{' '}
            {t('composer.toAsk')}
          </p>
        ) : (
          <p className="hidden px-1 text-[11px] text-muted-foreground md:block">
            {t('composer.hint')}
          </p>
        )}
      </form>
    </div>
  );
}

function DictationButton({
  dictation,
  disabled,
}: Readonly<{
  dictation: ReturnType<typeof useQuestionDictation>;
  disabled: boolean;
}>) {
  const t = useT();
  const listening = dictation.status === 'listening';
  const finishing = dictation.status === 'finishing';
  const label = t(
    listening || finishing ? 'composer.voice.stop' : 'composer.voice.start',
  );

  return (
    <Button
      type="button"
      size="icon"
      variant={listening ? 'destructive' : 'ghost'}
      aria-label={label}
      title={label}
      className="rounded-full"
      disabled={disabled || finishing}
      onClick={dictation.toggle}
    >
      {finishing ? (
        <Spinner />
      ) : listening ? (
        <Square className="size-3.5 fill-current" />
      ) : (
        <Mic />
      )}
    </Button>
  );
}

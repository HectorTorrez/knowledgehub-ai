import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowUp,
  FileText,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  Minus,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { usePrefersReducedMotion } from '~/hooks/use-in-view';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const QUESTIONS = ['onboarding', 'renewals', 'kickoff'] as const;
type QuestionKey = (typeof QUESTIONS)[number];
type NoteKey = 1 | 2;
type Phase = 'searching' | 'answered';

const FIRST_SEARCH_MS = 1300;
const NEXT_SEARCH_MS = 750;
const WORD_STAGGER_MS = 28;

const FILES = [
  { key: 'onboarding', type: 'PDF', size: '2.4 MB', ready: true },
  { key: 'handbook', type: 'DOCX', size: '860 KB', ready: true },
  { key: 'contract', type: 'PDF', size: '1.1 MB', ready: true },
  { key: 'kickoff', type: 'MD', size: '12 KB', ready: true },
  { key: 'pricing', type: 'TXT', size: '8 KB', ready: false },
] as const;

const NAV = [
  { key: 'navDocuments', icon: FileText },
  { key: 'navAsk', icon: MessageSquareText },
  { key: 'navSearch', icon: Search },
  { key: 'navCollections', icon: FolderOpen },
] as const;

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function StreamedWords({
  text,
  offset,
}: Readonly<{ text: string; offset: number }>) {
  return text.split(' ').map((word, index) => (
    <Fragment key={`${word}-${index}`}>
      {index > 0 && ' '}
      <span
        className="kh-word"
        style={delay((offset + index) * WORD_STAGGER_MS)}
      >
        {word}
      </span>
    </Fragment>
  ));
}

function CitationButton({
  number,
  active,
  appearAt,
  onSelect,
}: Readonly<{
  number: NoteKey;
  active: boolean;
  appearAt: number;
  onSelect: (number: NoteKey) => void;
}>) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t('landing.sample.showSource', { number })}
      aria-pressed={active}
      onMouseEnter={() => onSelect(number)}
      onFocus={() => onSelect(number)}
      onClick={() => onSelect(number)}
      style={delay(appearAt)}
      className={cn(
        'kh-pop mx-0.5 inline-flex size-5 cursor-pointer items-center justify-center align-text-top font-geist-mono text-[0.68rem] font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground ring-1 ring-border hover:bg-accent',
      )}
    >
      {number}
    </button>
  );
}

function useAnswerPhase(question: QuestionKey) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>('searching');
  const hasAnswered = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      setPhase('answered');
      return;
    }
    setPhase('searching');
    const timer = window.setTimeout(
      () => {
        hasAnswered.current = true;
        setPhase('answered');
      },
      hasAnswered.current ? NEXT_SEARCH_MS : FIRST_SEARCH_MS,
    );
    return () => window.clearTimeout(timer);
  }, [question, reducedMotion]);

  return phase;
}

export function ProductWindow() {
  const t = useT();
  const [question, setQuestion] = useState<QuestionKey>('onboarding');
  const [activeNote, setActiveNote] = useState<NoteKey>(1);
  const [pickedByVisitor, setPickedByVisitor] = useState(false);
  const phase = useAnswerPhase(question);
  const base = `landing.sample.questions.${question}` as const;
  const activeDocument = t(`${base}.note${activeNote}Document`);
  const searching = phase === 'searching';

  const sentence1 = t(`${base}.sentence1`);
  const sentence2 = t(`${base}.sentence2`);
  const firstWords = sentence1.split(' ').length;
  const secondWords = sentence2.split(' ').length;
  const firstCitationAt = firstWords * WORD_STAGGER_MS + 80;
  const secondOffset = firstWords + 2;
  const secondCitationAt = (secondOffset + secondWords) * WORD_STAGGER_MS + 80;
  const sourcesAt = secondCitationAt + 120;

  const pageAt = pickedByVisitor ? 0 : firstCitationAt;

  function selectNote(number: NoteKey) {
    setPickedByVisitor(true);
    setActiveNote(number);
  }

  function chooseQuestion(next: QuestionKey) {
    setQuestion(next);
    setActiveNote(1);
    setPickedByVisitor(false);
  }

  return (
    <figure
      aria-label={t('landing.sample.label')}
      className="overflow-hidden border border-foreground/20 bg-card text-left shadow-[0_32px_80px_-40px_oklch(0_0_0/0.45)]"
    >
      <div className="flex h-11 items-center gap-3 border-b bg-muted/50 px-4 text-xs text-muted-foreground">
        <span className="flex size-5 items-center justify-center bg-brand font-semibold text-brand-foreground">
          N
        </span>
        <span className="font-medium text-foreground">
          {t('landing.sample.workspace')}
        </span>
        <span aria-hidden="true">/</span>
        <span>{t('landing.sample.navAsk')}</span>
        <span className="ml-auto hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1 sm:flex">
          <Search className="size-3.5" />
          <span className="w-40 truncate">{t('landing.sample.navSearch')}</span>
          <kbd className="font-geist-mono text-[0.65rem]">⌘K</kbd>
        </span>
      </div>

      <div className="grid lg:grid-cols-[13.5rem_minmax(0,1fr)_23rem]">
        <aside className="hidden border-r bg-muted/30 p-3 text-[0.8rem] lg:block">
          <ul className="space-y-0.5">
            {NAV.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5',
                  key === 'navAsk'
                    ? 'bg-background font-medium text-foreground shadow-xs ring-1 ring-border'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
                {t(`landing.sample.${key}`)}
              </li>
            ))}
          </ul>
          <p className="mt-5 px-2 text-[0.7rem] font-medium text-muted-foreground">
            {t('landing.sample.documents')}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {FILES.map((file, index) => {
              const name = t(`landing.sample.files.${file.key}`);
              const isOpen = !searching && name === activeDocument;
              return (
                <li
                  key={`${file.key}-${searching ? question : 'open'}`}
                  style={searching ? delay(index * 140) : undefined}
                  className={cn(
                    'rounded-md px-2 py-1.5 transition-[background-color,box-shadow] duration-300',
                    searching && 'kh-scan',
                    isOpen && 'bg-background ring-1 ring-border',
                  )}
                >
                  <p
                    className={cn(
                      'truncate',
                      isOpen ? 'font-medium' : 'text-foreground/80',
                    )}
                  >
                    {name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                    <span className="font-geist-mono">{file.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{file.size}</span>
                    <span aria-hidden="true">·</span>
                    {file.ready ? (
                      t('landing.sample.ready')
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                        {t('landing.sample.processing')}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="order-2 hidden min-w-0 border-t bg-muted/40 md:block lg:order-none lg:border-t-0 lg:border-r">
          <div className="flex h-10 items-center gap-3 border-b bg-background px-4 text-xs">
            <FileText className="size-3.5 shrink-0" />
            <span
              key={searching ? 'searching' : activeDocument}
              className="kh-fade truncate font-medium"
            >
              {searching ? t('landing.sample.searching') : activeDocument}
            </span>
            {!searching && (
              <span className="kh-fade ml-auto shrink-0 text-muted-foreground">
                {t('landing.sample.pageOf', {
                  page: t(`${base}.note${activeNote}Page`),
                })}
              </span>
            )}
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 text-muted-foreground',
                searching && 'ml-auto',
              )}
            >
              <Minus className="size-3.5" />
              <span className="font-geist-mono text-[0.68rem]">100%</span>
              <Plus className="size-3.5" />
            </span>
          </div>
          <div className="px-6 py-7 xl:px-10">
            {searching ? (
              <div className="mx-auto flex min-h-[23rem] max-w-md flex-col gap-3 rounded-sm bg-background/60 px-7 py-8 ring-1 ring-border">
                <span className="kh-shimmer h-4 w-2/3 rounded" />
                <span className="kh-shimmer mt-3 h-2.5 w-full rounded" />
                <span className="kh-shimmer h-2.5 w-11/12 rounded" />
                <span className="kh-shimmer h-2.5 w-4/5 rounded" />
              </div>
            ) : (
              <article
                key={`${question}-${activeNote}`}
                style={delay(pageAt)}
                className="kh-page mx-auto flex min-h-[23rem] max-w-md flex-col rounded-sm bg-background px-7 py-8 text-[0.82rem] leading-relaxed shadow-[0_1px_3px_oklch(0_0_0/0.08),0_8px_24px_-12px_oklch(0_0_0/0.18)] ring-1 ring-border"
              >
                <p className="text-base font-semibold tracking-tight">
                  {activeDocument.replace(/\.[a-z]+$/, '')}
                </p>
                <p className="mt-5 text-muted-foreground">
                  {t(`${base}.note${activeNote}Context`)}
                </p>
                <p className="mt-3">
                  <mark
                    data-active
                    className="cited-passage px-0.5"
                    style={
                      {
                        '--sweep-delay': `${pageAt + 200}ms`,
                      } as CSSProperties
                    }
                  >
                    {t(`${base}.note${activeNote}Quote`)}
                  </mark>
                </p>
                <p className="mt-auto pt-6 text-right font-geist-mono text-[0.65rem] text-muted-foreground">
                  {t(`${base}.note${activeNote}Page`)}
                </p>
              </article>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <p
            key={question}
            className="kh-rise ml-auto max-w-[90%] bg-primary px-3.5 py-2.5 text-[0.85rem] text-primary-foreground"
          >
            {t(`${base}.question`)}
          </p>
          <p className="mt-5 flex items-center gap-2 text-xs font-medium">
            {searching ? (
              <LoaderCircle className="size-3.5 animate-spin text-brand" />
            ) : (
              <Sparkles className="size-3.5 text-brand" />
            )}
            {searching
              ? t('landing.sample.searching')
              : t('landing.sample.answer')}
            {!searching && (
              <span
                className="kh-fade ml-auto font-normal text-muted-foreground"
                style={delay(sourcesAt)}
              >
                {t('landing.sample.grounded')}
              </span>
            )}
          </p>
          <div aria-live="polite" className="min-h-[7.5rem]">
            {searching ? (
              <div className="mt-3 space-y-2">
                <span className="kh-shimmer block h-2.5 w-full rounded" />
                <span className="kh-shimmer block h-2.5 w-10/12 rounded" />
                <span className="kh-shimmer block h-2.5 w-7/12 rounded" />
              </div>
            ) : (
              <p
                key={question}
                className="mt-2.5 text-[0.9rem] leading-relaxed"
              >
                <StreamedWords text={sentence1} offset={0} />
                <CitationButton
                  number={1}
                  active={activeNote === 1}
                  appearAt={firstCitationAt}
                  onSelect={selectNote}
                />{' '}
                <StreamedWords text={sentence2} offset={secondOffset} />
                <CitationButton
                  number={2}
                  active={activeNote === 2}
                  appearAt={secondCitationAt}
                  onSelect={selectNote}
                />
              </p>
            )}
          </div>
          <p className="mt-4 text-[0.7rem] font-medium text-muted-foreground">
            {t('landing.sample.sources')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {([1, 2] as const).map((number) => (
              <li
                key={`${question}-${number}-${phase}`}
                className={cn(!searching && 'kh-rise')}
                style={
                  searching ? undefined : delay(sourcesAt + (number - 1) * 90)
                }
              >
                {searching ? (
                  <span className="kh-shimmer block h-9 rounded-lg" />
                ) : (
                  <button
                    type="button"
                    onClick={() => selectNote(number)}
                    onMouseEnter={() => selectNote(number)}
                    aria-pressed={activeNote === number}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      activeNote === number
                        ? 'border-primary/50 bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center font-geist-mono text-[0.68rem] transition-colors duration-200',
                        activeNote === number
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted ring-1 ring-border',
                      )}
                    >
                      {number}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t(`${base}.note${number}Document`)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {t('landing.sample.pageOf', {
                        page: t(`${base}.note${number}Page`),
                      })}
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[0.7rem] font-medium text-muted-foreground">
            {t('landing.sample.tryQuestion')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUESTIONS.filter((key) => key !== question).map((key) => (
              <button
                key={key}
                type="button"
                disabled={searching}
                onClick={() => chooseQuestion(key)}
                className="border px-3 py-1 text-left text-xs transition-[background-color,transform] duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
              >
                {t(`landing.sample.questions.${key}.question`)}
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 border bg-background py-1.5 pr-1.5 pl-3.5 text-[0.8rem] text-muted-foreground lg:mt-auto">
            <span className="flex-1 truncate">
              {t('landing.sample.placeholder')}
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ArrowUp className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

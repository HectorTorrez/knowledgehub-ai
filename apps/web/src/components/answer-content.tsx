import type { AnswerCitation } from '@knowledgehub/shared-types';
import { Link } from '@tanstack/react-router';
import { Check, ChevronDown, Copy, Layers, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { sourceId, passageSearch } from '~/lib/answer-source';
import { cn } from '~/lib/utils';

export function AnswerBody({
  text,
  sourceIdPrefix,
  onCitationSelect,
}: Readonly<{
  text: string;
  sourceIdPrefix?: string;
  onCitationSelect?: (marker: number) => void;
}>) {
  const parts = text.split(/(\[\d+\])/g);

  return (
    <p className="text-base leading-relaxed break-words whitespace-pre-wrap sm:text-sm">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);

        if (match) {
          return (
            <CitationMarker
              key={index}
              marker={Number(match[1])}
              sourceIdPrefix={sourceIdPrefix}
              onSelect={onCitationSelect}
            />
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

export function CitationMarker({
  marker,
  sourceIdPrefix,
  onSelect,
}: Readonly<{
  marker: number;
  sourceIdPrefix?: string;
  onSelect?: (marker: number) => void;
}>) {
  const href = `#${sourceId(sourceIdPrefix, marker)}`;

  return (
    <a
      href={href}
      aria-label={`Go to source ${marker}`}
      onClick={(event) => {
        if (onSelect === undefined) {
          return;
        }

        event.preventDefault();
        onSelect(marker);
      }}
      className="relative mx-0.5 inline-flex h-4 min-w-4 translate-y-[-1px] items-center justify-center rounded-sm bg-brand/10 px-1 align-middle text-[10px] leading-none font-semibold text-brand transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none after:absolute after:-inset-2 after:content-[''] hover:bg-brand/20"
    >
      {marker}
    </a>
  );
}

export function CopyButton({ text }: Readonly<{ text: string }>) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      return;
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy answer'}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export function InsufficientEvidence() {
  return (
    <Alert>
      <SearchX />
      <AlertTitle>Not enough evidence</AlertTitle>
      <AlertDescription>
        The uploaded documents don&apos;t contain enough information to answer
        this question.
      </AlertDescription>
    </Alert>
  );
}

export function SourcesList({
  citations,
  organizationId,
  sourceIdPrefix,
}: Readonly<{
  citations: AnswerCitation[];
  organizationId?: string;
  sourceIdPrefix?: string;
}>) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Sources</h3>
      <ol className="space-y-3">
        {citations.map((citation) => (
          <li
            key={`${citation.marker}-${citation.documentId}-${citation.chunkIndex}`}
            id={sourceId(sourceIdPrefix, citation.marker)}
            className="scroll-mt-[calc(5rem+env(safe-area-inset-top))] rounded-lg border p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-brand/10 text-[11px] font-semibold text-brand">
                {citation.marker}
              </span>
              {organizationId === undefined ? (
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  {citation.documentTitle}
                </p>
              ) : (
                <Link
                  to="/organizations/$organizationId/documents/$documentId"
                  params={{
                    organizationId,
                    documentId: citation.documentId,
                  }}
                  search={passageSearch(citation.pageNumber, citation.excerpt)}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  title={`Open ${citation.documentTitle} at page ${citation.pageNumber}`}
                >
                  {citation.documentTitle}
                </Link>
              )}
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

export function AnswerSources({
  citations,
  organizationId,
  sourceIdPrefix,
  open,
  onOpenChange,
}: Readonly<{
  citations: AnswerCitation[];
  organizationId?: string;
  sourceIdPrefix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl border bg-card/60"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-controls={`${sourceIdPrefix}-sources`}
          className="h-auto w-full justify-between gap-2 rounded-none px-3 py-2.5 text-left font-normal whitespace-normal hover:bg-muted/50"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5 shrink-0" />
            <span>Sources</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              {citations.length}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ol
          id={`${sourceIdPrefix}-sources`}
          className={cn(
            'grid gap-2 border-t p-2',
            citations.length > 1 && 'sm:grid-cols-2',
          )}
        >
          {citations.map((citation) => (
            <li
              key={`${citation.marker}-${citation.documentId}-${citation.chunkIndex}`}
              id={sourceId(sourceIdPrefix, citation.marker)}
              className="scroll-mt-4 rounded-lg border bg-background p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-brand/10 text-[11px] font-semibold text-brand">
                  {citation.marker}
                </span>
                {organizationId === undefined ? (
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">
                    {citation.documentTitle}
                  </p>
                ) : (
                  <Link
                    to="/organizations/$organizationId/documents/$documentId"
                    params={{
                      organizationId,
                      documentId: citation.documentId,
                    }}
                    search={passageSearch(citation.pageNumber, citation.excerpt)}
                    className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
                    title={`Open ${citation.documentTitle} at page ${citation.pageNumber}`}
                  >
                    {citation.documentTitle}
                  </Link>
                )}
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  Page {citation.pageNumber}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {citation.excerpt}
              </p>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PartialAnswerNotice({ missing }: Readonly<{ missing: string[] }>) {
  return (
    <Alert aria-label="Missing information">
      <AlertTitle>Partial answer — missing information</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {missing.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

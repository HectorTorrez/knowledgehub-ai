import type { AnswerCitation } from '@knowledgehub/shared-types';
import { Link } from '@tanstack/react-router';
import { Check, Copy, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';

export function AnswerBody({ text }: Readonly<{ text: string }>) {
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

export function CitationMarker({ marker }: Readonly<{ marker: number }>) {
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

export function SourcesList({
  citations,
  organizationId,
}: Readonly<{
  citations: AnswerCitation[];
  organizationId?: string;
}>) {
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
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  title={`Open ${citation.documentTitle}`}
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

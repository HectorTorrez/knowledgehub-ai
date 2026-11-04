import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { findPassage } from '~/lib/passage';

export function TextDocumentViewer({
  url,
  quote,
  onError,
}: Readonly<{ url: string; quote?: string; onError: () => void }>) {
  const [text, setText] = useState<string>();
  const highlight = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Storage responded ${response.status}`);
        return response.text();
      })
      .then(setText)
      .catch(() => {
        if (!controller.signal.aborted) onError();
      });
    return () => controller.abort();
  }, [url, onError]);

  useEffect(() => {
    highlight.current?.scrollIntoView({ block: 'center' });
  }, [text, quote]);

  if (text === undefined) {
    return (
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  const match = quote ? findPassage(text, quote) : undefined;

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Document preview"
      className="focus-visible:ring-2 focus-visible:ring-ring max-h-[75vh] overflow-auto rounded-lg border bg-card p-4"
    >
      <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">
        {match ? (
          <>
            {text.slice(0, match.start)}
            <mark
              ref={highlight}
              data-highlight="true"
              className="rounded-sm bg-yellow-300/60 text-foreground dark:bg-yellow-400/40"
            >
              {text.slice(match.start, match.end)}
            </mark>
            {text.slice(match.end)}
          </>
        ) : (
          text
        )}
      </pre>
    </div>
  );
}

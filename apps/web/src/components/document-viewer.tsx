import { RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { PdfDocumentViewer } from '~/components/pdf-document-viewer';
import { TextDocumentViewer } from '~/components/text-document-viewer';
import { Button } from '~/components/ui/button';

export function DocumentViewer({
  url,
  contentType,
  page,
  quote,
  onRetry,
}: Readonly<{
  url: string;
  contentType: string | null;
  page?: number;
  quote?: string;
  onRetry: () => void;
}>) {
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center text-sm"
      >
        <p className="text-muted-foreground">
          The document preview could not be loaded.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setFailed(false);
            onRetry();
          }}
        >
          <RotateCcw />
          Retry
        </Button>
      </div>
    );
  }

  if (contentType === 'application/pdf') {
    return (
      <PdfDocumentViewer
        url={url}
        initialPage={page ?? 1}
        quote={quote}
        onError={fail}
      />
    );
  }

  return <TextDocumentViewer url={url} quote={quote} onError={fail} />;
}

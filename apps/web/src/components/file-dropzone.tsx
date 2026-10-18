import { FileText, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '~/lib/format';
import { cn } from '~/lib/utils';

export function FileDropzone({
  accept,
  file,
  onFileChange,
}: Readonly<{
  accept: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Choose a file to upload"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openPicker();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        dragging ? 'border-primary bg-accent/50' : 'border-input hover:bg-accent/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <FileText className="size-8 text-muted-foreground" />
          <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.size)} · click or drop to replace
          </p>
        </>
      ) : (
        <>
          <UploadCloud className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drop your file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, plain text, or Markdown
          </p>
        </>
      )}
    </div>
  );
}

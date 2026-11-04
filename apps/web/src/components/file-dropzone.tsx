import { FileText, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';
import { MAX_PROCESSABLE_UPLOAD_BYTES } from '~/lib/upload-validation';
import { cn } from '~/lib/utils';

export function FileDropzone({
  accept,
  files,
  disabled = false,
  onFilesAdd,
}: Readonly<{
  accept: string;
  files: File[];
  disabled?: boolean;
  onFilesAdd: (files: File[]) => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function add(list: FileList | null) {
    const next = Array.from(list ?? []);

    if (next.length > 0) {
      onFilesAdd(next);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (!disabled) {
      add(event.dataTransfer.files);
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={t('dropzone.choose')}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === ' ') event.preventDefault();
        if (event.key === 'Enter' || event.key === ' ') openPicker();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6',
        disabled && 'cursor-not-allowed opacity-60',
        dragging
          ? 'border-brand bg-brand/5'
          : 'border-input hover:bg-accent/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        tabIndex={-1}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          add(event.target.files);
          event.target.value = '';
        }}
      />
      {files.length > 0 ? (
        <>
          <FileText
            className={cn(
              'size-8',
              dragging ? 'text-brand' : 'text-muted-foreground',
            )}
          />
          <p className="text-sm font-medium">
            {dragging
              ? t('dropzone.drop')
              : t('dropzone.filesReady', { count: files.length })}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(
              files.reduce((total, file) => total + file.size, 0),
              locale,
            )}{' '}
            · {t('dropzone.chooseMore')}
          </p>
        </>
      ) : (
        <>
          <UploadCloud
            className={cn(
              'size-8',
              dragging ? 'text-brand' : 'text-muted-foreground',
            )}
          />
          <p className="text-sm font-medium">
            {dragging ? t('dropzone.drop') : t('dropzone.choose')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('dropzone.accepted', {
              size: formatBytes(MAX_PROCESSABLE_UPLOAD_BYTES, locale),
            })}
          </p>
        </>
      )}
    </div>
  );
}

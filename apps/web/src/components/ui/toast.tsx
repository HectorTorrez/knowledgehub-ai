import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { cn } from '~/lib/utils';

type ToastVariant = 'success' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastEntry extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current, { ...input, id }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((entry) => (
          <ToastEntryView key={entry.id} entry={entry} onDismiss={() => dismiss(entry.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}

function ToastEntryView({
  entry,
  onDismiss,
}: Readonly<{ entry: ToastEntry; onDismiss: () => void }>) {
  const isError = entry.variant === 'error';
  const Icon = isError ? TriangleAlert : CircleCheck;

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md',
        isError ? 'border-destructive/40' : 'border-border',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{entry.title}</p>
        {entry.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

import {
  CircleCheck,
  Info,
  TriangleAlert,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '~/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastRecord {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 5000,
  info: 6000,
  error: 9000,
};

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: LucideIcon; iconClassName: string }
> = {
  success: {
    icon: CircleCheck,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
  },
  error: { icon: TriangleAlert, iconClassName: 'text-destructive' },
  info: { icon: Info, iconClassName: 'text-muted-foreground' },
};

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToasts((current) => [
      ...current.slice(-3),
      {
        id: nextId.current,
        title: options.title,
        description: options.description,
        variant: options.variant ?? 'info',
      },
    ]);
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((record) => (
          <ToastItem key={record.id} record={record} onDismiss={dismiss} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

function ToastItem({
  record,
  onDismiss,
}: Readonly<{ record: ToastRecord; onDismiss: (id: number) => void }>) {
  const config = VARIANT_STYLES[record.variant];
  const Icon = config.icon;

  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(record.id),
      AUTO_DISMISS_MS[record.variant],
    );

    return () => window.clearTimeout(timer);
  }, [record.id, record.variant, onDismiss]);

  return (
    <li
      className="toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', config.iconClassName)} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{record.title}</p>
        {record.description ? (
          <p className="text-sm text-muted-foreground">{record.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(record.id)}
        aria-label="Dismiss notification"
        className="-m-1 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <XIcon className="size-4" />
      </button>
    </li>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider.');
  }

  return context;
}

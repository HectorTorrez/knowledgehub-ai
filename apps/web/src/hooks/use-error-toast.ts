import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '~/components/ui/toast';
import { isApiError, isRateLimited } from '~/lib/api/errors';

export function errorToastContent(error: unknown): {
  title: string;
  description?: string;
} {
  const title = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  const details: string[] = [];

  if (isRateLimited(error)) {
    details.push(retryMessage(error.retryAfterSeconds ?? 0));
  }

  const validationErrors = isApiError(error) ? error.validationErrors : [];

  if (validationErrors.length > 1) {
    details.push(...validationErrors);
  }

  return details.length === 0
    ? { title }
    : { title, description: details.join('\n') };
}

export function useReportError(): (
  error: unknown,
  onRetry?: () => void,
) => void {
  const { toast } = useToast();

  return useCallback(
    (error: unknown, onRetry?: () => void) => {
      toast({
        variant: 'error',
        ...errorToastContent(error),
        action:
          onRetry === undefined
            ? undefined
            : { label: 'Try again', onClick: onRetry },
      });
    },
    [toast],
  );
}

export function useQueryErrorToast(
  error: unknown,
  onRetry?: () => void,
): void {
  const { toast } = useToast();
  const reported = useRef<unknown>(null);
  const retry = useRef(onRetry);
  retry.current = onRetry;

  useEffect(() => {
    if (error === null || error === undefined) {
      reported.current = null;
      return;
    }

    if (reported.current === error) {
      return;
    }

    reported.current = error;
    toast({
      variant: 'error',
      duration: 0,
      ...errorToastContent(error),
      action:
        retry.current === undefined
          ? undefined
          : { label: 'Try again', onClick: () => retry.current?.() },
    });
  }, [error, toast]);
}
function retryMessage(seconds: number): string {
  if (seconds <= 0) {
    return 'You can try again now.';
  }

  if (seconds < 60) {
    return `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

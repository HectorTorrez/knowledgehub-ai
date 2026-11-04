import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '~/components/ui/toast';
import { describeError } from '~/lib/api/error-messages';
import { useT } from '~/lib/i18n/provider';

export function errorToastContent(
  error: unknown,
  t: ReturnType<typeof useT>,
): {
  title: string;
  description?: string;
} {
  const { title, details } = describeError(error, t);

  return details.length === 0
    ? { title }
    : { title, description: details.join('\n') };
}

export function useReportError(): (
  error: unknown,
  onRetry?: () => void,
) => void {
  const { toast } = useToast();
  const t = useT();

  return useCallback(
    (error: unknown, onRetry?: () => void) => {
      toast({
        variant: 'error',
        ...errorToastContent(error, t),
        action:
          onRetry === undefined
            ? undefined
            : { label: t('common.tryAgain'), onClick: onRetry },
      });
    },
    [toast, t],
  );
}

export function useQueryErrorToast(error: unknown, onRetry?: () => void): void {
  const { toast } = useToast();
  const t = useT();
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
      ...errorToastContent(error, t),
      action:
        retry.current === undefined
          ? undefined
          : { label: t('common.tryAgain'), onClick: () => retry.current?.() },
    });
  }, [error, toast, t]);
}

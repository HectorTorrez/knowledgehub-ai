import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useToast } from '~/components/ui/toast';
import { documentsApi } from '~/lib/api/documents';
import {
  TrackingContext,
  browserNotificationsEnabled,
  decideDocumentNotifications,
  readTrackedDocuments,
  writeTrackedDocuments,
} from '~/lib/document-notifications';
import { documentFailureMessage } from '~/lib/document-display';
import { useT } from '~/lib/i18n/hooks';

export function DocumentNotificationsProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<string[]>(() =>
    readTrackedDocuments(organizationId),
  );
  const [delay, setDelay] = useState(2500);
  const navigate = useNavigate();
  const { toast } = useToast();
  const t = useT();
  const track = useCallback(
    (id: string) =>
      setPending((items) => (items.includes(id) ? items : [...items, id])),
    [],
  );

  useEffect(() => {
    writeTrackedDocuments(organizationId, pending);
  }, [organizationId, pending]);

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const results = await Promise.allSettled(
        pending.map((id) => documentsApi.detail(organizationId, id)),
      );
      if (cancelled) return;
      const { ready, failed, removed } = decideDocumentNotifications(
        pending,
        results,
      );
      const completed = new Set([
        ...ready.map((item) => item.id),
        ...failed.map((item) => item.id),
        ...removed,
      ]);
      if (ready.length > 0) {
        const first = ready[0];
        const title =
          ready.length === 1
            ? t('notifications.ready', { title: first.title })
            : t('notifications.readyMany', { count: ready.length });
        toast({
          variant: 'success',
          title,
          secondaryAction:
            ready.length === 1
              ? {
                  label: t('notifications.askAbout'),
                  onClick: () =>
                    void navigate({
                      to: '/organizations/$organizationId/ask',
                      params: { organizationId },
                      search: { documentId: first.id },
                    }),
                }
              : undefined,
          action: {
            label: t('notifications.view'),
            onClick: () =>
              void navigate({
                to:
                  ready.length === 1
                    ? '/organizations/$organizationId/documents/$documentId'
                    : '/organizations/$organizationId/documents',
                params: { organizationId, documentId: first.id },
              }),
          },
        });
        notifyBrowser(title);
      }
      for (const item of failed) {
        const title = t('notifications.failed', { title: item.title });
        const description =
          documentFailureMessage(item.failureReason, t) ??
          t('documents.processingFailed');
        toast({
          variant: 'error',
          title,
          description,
          action: {
            label: t('notifications.view'),
            onClick: () =>
              void navigate({
                to: '/organizations/$organizationId/documents/$documentId',
                params: { organizationId, documentId: item.id },
              }),
          },
        });
        notifyBrowser(title, description);
      }
      setPending((items) => items.filter((id) => !completed.has(id)));
      setDelay((current) => Math.min(current * 2, 30000));
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pending, delay, organizationId, navigate, toast, t]);

  return (
    <TrackingContext.Provider value={track}>
      {children}
    </TrackingContext.Provider>
  );
}

function notifyBrowser(title: string, body?: string) {
  if (
    document.visibilityState === 'hidden' &&
    browserNotificationsEnabled() &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    new Notification(title, { body });
  }
}

import type {
  DocumentSummary,
  DocumentStatus,
} from '@knowledgehub/shared-types';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { terminalTransition } from '~/lib/document-polling';
import { useToast } from '~/components/ui/toast';
import { useT } from '~/lib/i18n/provider';

export function useDocumentNotifications(
  organizationId: string,
  documents: DocumentSummary[],
) {
  const previous = useRef(new Map<string, DocumentStatus>());
  const navigate = useNavigate();
  const { toast } = useToast();
  const t = useT();
  useEffect(() => {
    for (const document of documents) {
      const before = previous.current.get(document.id);
      if (terminalTransition(before, document.status)) {
        if (document.status === 'READY') {
          toast({
            variant: 'success',
            title: t('notifications.ready', { title: document.title }),
            secondaryAction: {
              label: t('notifications.view'),
              onClick: () =>
                void navigate({
                  to: '/organizations/$organizationId/documents/$documentId',
                  params: { organizationId, documentId: document.id },
                }),
            },
            action: {
              label: t('notifications.askAbout'),
              onClick: () =>
                void navigate({
                  to: '/organizations/$organizationId/ask',
                  params: { organizationId },
                  search: { documentId: document.id },
                }),
            },
          });
        } else if (document.status === 'FAILED') {
          toast({
            variant: 'error',
            title: t('notifications.failed', { title: document.title }),
            action: {
              label: t('notifications.view'),
              onClick: () =>
                void navigate({
                  to: '/organizations/$organizationId/documents/$documentId',
                  params: { organizationId, documentId: document.id },
                }),
            },
          });
        }
      }
      previous.current.set(document.id, document.status);
    }
  }, [documents, navigate, organizationId, toast, t]);
}

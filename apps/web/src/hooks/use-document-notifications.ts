import type { DocumentSummary, DocumentStatus } from '@knowledgehub/shared-types';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useToast } from '~/components/ui/toast';

export function useDocumentNotifications(organizationId: string, documents: DocumentSummary[]) {
  const previous = useRef(new Map<string, DocumentStatus>());
  const navigate = useNavigate();
  const { toast } = useToast();
  useEffect(() => {
    for (const document of documents) {
      const before = previous.current.get(document.id);
      if (before && before !== document.status && (before === 'PENDING' || before === 'PROCESSING')) {
        if (document.status === 'READY') {
          toast({ variant: 'success', title: `${document.title} is ready`, action: { label: 'Ask about it', onClick: () => void navigate({ to: '/organizations/$organizationId/ask', params: { organizationId }, search: { documentId: document.id } }) } });
        } else if (document.status === 'FAILED') {
          toast({ variant: 'error', title: `${document.title} failed`, action: { label: 'View document', onClick: () => void navigate({ to: '/organizations/$organizationId/documents/$documentId', params: { organizationId, documentId: document.id } }) } });
        }
      }
      previous.current.set(document.id, document.status);
    }
  }, [documents, navigate, organizationId, toast]);
}

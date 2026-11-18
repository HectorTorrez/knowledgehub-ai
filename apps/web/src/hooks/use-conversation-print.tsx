import type { AnswerDetail } from '@knowledgehub/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PrintableConversationView,
  type PrintableConversation,
} from '~/components/conversation-print';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';

async function loadConversationTurns(
  organizationId: string,
  conversationId: string,
  loadDetail: (answerId: string) => Promise<AnswerDetail>,
): Promise<AnswerDetail[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await answersApi.list(organizationId, {
      conversationId,
      cursor,
      limit: 100,
    });
    ids.push(...page.answers.map((answer) => answer.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  const turns = await Promise.all(ids.map(loadDetail));
  return turns.reverse();
}

export function useConversationPrint(organizationId: string) {
  const client = useQueryClient();
  const [document, setDocument] = useState<PrintableConversation | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (document === null) {
      return;
    }

    const clear = () => setDocument(null);
    window.addEventListener('afterprint', clear, { once: true });
    const frame = window.requestAnimationFrame(() => window.print());

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', clear);
    };
  }, [document]);

  async function print(conversationId: string, title: string) {
    setPreparing(true);

    try {
      const turns = await loadConversationTurns(
        organizationId,
        conversationId,
        async (answerId) =>
          (
            await client.fetchQuery({
              queryKey: queryKeys.organizations.answers.detail(
                organizationId,
                answerId,
              ),
              queryFn: () => answersApi.detail(organizationId, answerId),
              staleTime: 30_000,
            })
          ).answer,
      );
      setDocument({ title, exportedAt: new Date().toISOString(), turns });
    } finally {
      setPreparing(false);
    }
  }

  const portal =
    document === null
      ? null
      : createPortal(
          <div id="print-root">
            <PrintableConversationView conversation={document} />
          </div>,
          window.document.body,
        );

  return { print, preparing, portal };
}

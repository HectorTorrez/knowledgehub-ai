import type { AnswerDetail } from '@knowledgehub/shared-types';
import { formatDateTime } from '~/lib/format';
import { useLocale, useT } from '~/lib/i18n/hooks';

export interface PrintableConversation {
  title: string;
  exportedAt: string;
  turns: AnswerDetail[];
}

export function PrintableConversationView({
  conversation,
}: Readonly<{ conversation: PrintableConversation }>) {
  const t = useT();
  const locale = useLocale();

  return (
    <article className="mx-auto max-w-[44rem] space-y-8 p-8 font-sans text-[11pt] leading-relaxed">
      <header className="space-y-1 border-b pb-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">
          KnowledgeHub AI
        </p>
        <h1 className="text-2xl font-semibold">{conversation.title}</h1>
        <p className="text-xs text-neutral-500">
          {t('ask.exportedOn', {
            date: formatDateTime(conversation.exportedAt, locale),
          })}
        </p>
      </header>

      {conversation.turns.map((turn, index) => (
        <section key={turn.id} className="space-y-3">
          <div className="print-avoid-break space-y-1">
            <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              {t('ask.printQuestion')} {index + 1}
            </h2>
            <p className="font-medium whitespace-pre-wrap">{turn.question}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              {t('ask.printAnswer')}
            </h3>
            {turn.status === 'insufficient_evidence' ? (
              <p className="italic">{t('answer.markdownNotEnough')}</p>
            ) : (
              <p className="whitespace-pre-wrap">{turn.answer}</p>
            )}
            {turn.status === 'partial' && (turn.missing ?? []).length > 0 ? (
              <div className="print-avoid-break rounded border p-3">
                <p className="text-sm font-medium">
                  {t('answer.partialTitle')}
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {(turn.missing ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {turn.citations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                {t('answer.sources')}
              </h3>
              <ol className="space-y-2">
                {turn.citations.map((citation) => (
                  <li
                    key={`${citation.marker}-${citation.documentId}-${citation.chunkIndex}`}
                    className="print-avoid-break text-sm"
                  >
                    <p className="font-medium">
                      [{citation.marker}] {citation.documentTitle} ·{' '}
                      {t('search.page', { page: citation.pageNumber })}
                    </p>
                    <p className="border-l-2 pl-2 text-neutral-600">
                      {citation.excerpt}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}

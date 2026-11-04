import type { DocumentSummary } from '@knowledgehub/shared-types';
import { Progress } from '~/components/ui/progress';
import { useLocale, useT } from '~/lib/i18n/hooks';

const steps = ['uploading', 'queued', 'processing', 'ready'] as const;

function stageIndex(document: DocumentSummary): number {
  switch (document.processingStage) {
    case 'UPLOADING':
      return 0;
    case 'QUEUED':
      return 1;
    case 'PROCESSING':
      return 2;
    case 'READY':
      return 3;
    case 'FAILED':
      return document.failureKind === 'VERIFICATION' ? 0 : 2;
    default:
      return 0;
  }
}

export function DocumentProgress({
  document,
  detailed = false,
}: Readonly<{ document: DocumentSummary; detailed?: boolean }>) {
  const t = useT();
  const locale = useLocale();
  const index = stageIndex(document);
  const failed = document.status === 'FAILED';
  const label =
    document.processingStage === 'PROCESSING'
      ? t('progress.extracting')
      : t(`progress.${steps[index]}`);
  const retry = document.retry;

  return (
    <div className="mt-2 space-y-2 text-xs" role="status">
      {detailed ? (
        <ol
          className="flex flex-wrap gap-x-4 gap-y-2"
          aria-label={t('progress.stages')}
        >
          {steps.map((step, stepIndex) => (
            <li
              key={step}
              className={
                stepIndex === index && failed
                  ? 'font-medium text-destructive'
                  : stepIndex <= index
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
              }
            >
              <span className="mr-1">
                {stepIndex < index ? '✓' : `${stepIndex + 1}.`}
              </span>
              {t(`progress.${step}`)}
            </li>
          ))}
        </ol>
      ) : (
        <span className={failed ? 'text-destructive' : 'text-muted-foreground'}>
          {failed ? t('progress.failed', { label }) : label}
        </span>
      )}
      <Progress
        value={((index + 1) / steps.length) * 100}
        className="h-1"
        indicatorClassName={failed ? 'bg-destructive' : undefined}
        aria-label={t('progress.progressLabel')}
      />
      {retry ? (
        <p className="text-muted-foreground">
          {t('progress.retrying', {
            attempt: retry.attempt + 1,
            max: retry.maxAttempts,
            time: new Date(retry.nextRetryAt).toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </p>
      ) : null}
    </div>
  );
}

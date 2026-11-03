import type { DocumentSummary } from '@knowledgehub/shared-types';
import { Progress } from '~/components/ui/progress';

const steps = ['Uploading', 'Verifying', 'Queued', 'Extracting', 'Indexing', 'Enriching', 'Ready'];

function stageIndex(document: DocumentSummary): number {
  switch (document.processingStage) {
    case 'UPLOADING': return 0;
    case 'QUEUED': return 2;
    case 'PROCESSING': return 3;
    case 'ENRICHING': return 5;
    case 'READY': return 6;
    case 'FAILED': return document.failureKind === 'VERIFICATION' ? 1 : 3;
    default: return 0;
  }
}

export function DocumentProgress({ document, detailed = false }: Readonly<{ document: DocumentSummary; detailed?: boolean }>) {
  const index = stageIndex(document);
  const failed = document.status === 'FAILED';
  const label = document.processingStage === 'PROCESSING' ? 'Extracting and indexing' : steps[index];
  const retry = document.retry;

  return (
    <div className="mt-2 space-y-2 text-xs" role="status">
      {detailed ? (
        <ol className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Processing stages">
          {steps.map((step, stepIndex) => (
            <li key={step} className={stepIndex === index && failed ? 'font-medium text-destructive' : stepIndex <= index ? 'font-medium text-foreground' : 'text-muted-foreground'}>
              <span className="mr-1">{stepIndex < index ? '✓' : stepIndex + 1}.</span>{step}
            </li>
          ))}
        </ol>
      ) : <span className={failed ? 'text-destructive' : 'text-muted-foreground'}>{failed ? `Failed: ${label}` : label}</span>}
      <Progress value={failed ? (index / 6) * 100 : ((index + 1) / 7) * 100} className="h-1" indicatorClassName={failed ? 'bg-destructive' : undefined} aria-label="Document processing progress" />
      {retry ? <p className="text-muted-foreground">Retrying (attempt {retry.attempt + 1} of {retry.maxAttempts}) at {new Date(retry.nextRetryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p> : null}
    </div>
  );
}

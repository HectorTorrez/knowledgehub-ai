import { Library } from 'lucide-react';
import { cn } from '~/lib/utils';

export function Brand({
  className,
  compact = false,
}: Readonly<{ className?: string; compact?: boolean }>) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Library className="size-4" />
      </span>
      <span className="font-semibold tracking-tight">
        KnowledgeHub
        {compact ? <span className="hidden sm:inline"> AI</span> : ' AI'}
      </span>
    </span>
  );
}

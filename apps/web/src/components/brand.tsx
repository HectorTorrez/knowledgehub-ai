import { Library } from 'lucide-react';
import { cn } from '~/lib/utils';

export function Brand({
  className,
  compact = false,
  inverted = false,
}: Readonly<{ className?: string; compact?: boolean; inverted?: boolean }>) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground',
          inverted && 'bg-brand-foreground text-brand',
        )}
      >
        <Library className="size-4" />
      </span>
      <span className="font-semibold tracking-tight">
        KnowledgeHub
        {compact ? <span className="hidden sm:inline"> AI</span> : ' AI'}
      </span>
    </span>
  );
}

import type { DocumentStatus } from '@knowledgehub/shared-types';
import {
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  PENDING: {
    label: 'Pending',
    className: 'border-transparent bg-muted text-muted-foreground',
    icon: CircleDashed,
  },
  PROCESSING: {
    label: 'Processing',
    className: 'border-transparent bg-secondary text-secondary-foreground',
    icon: LoaderCircle,
  },
  READY: {
    label: 'Ready',
    className:
      'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    icon: CircleCheck,
  },
  FAILED: {
    label: 'Failed',
    className: 'border-transparent bg-destructive/10 text-destructive',
    icon: TriangleAlert,
  },
};

export function DocumentStatusBadge({
  status,
}: Readonly<{ status: DocumentStatus }>) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge className={cn('gap-1', config.className)}>
      <Icon
        className={cn(
          'size-3.5',
          status === 'PROCESSING' && 'animate-spin',
        )}
      />
      {config.label}
    </Badge>
  );
}

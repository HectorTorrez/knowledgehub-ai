import type { DocumentStatus } from '@knowledgehub/shared-types';
import {
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { useT } from '~/lib/i18n/provider';
import { cn } from '~/lib/utils';

const STATUS_CONFIG: Record<
  DocumentStatus,
  { className: string; icon: LucideIcon }
> = {
  PENDING: {
    className: 'border-transparent bg-muted text-muted-foreground',
    icon: CircleDashed,
  },
  PROCESSING: {
    className: 'border-transparent bg-info/15 text-info',
    icon: LoaderCircle,
  },
  READY: {
    className: 'border-transparent bg-success/15 text-success',
    icon: CircleCheck,
  },
  FAILED: {
    className: 'border-transparent bg-destructive/10 text-destructive',
    icon: TriangleAlert,
  },
};

export function DocumentStatusBadge({
  status,
}: Readonly<{ status: DocumentStatus }>) {
  const t = useT();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge className={cn('gap-1', config.className)}>
      <Icon
        className={cn(
          'size-3.5',
          status === 'PROCESSING' && 'animate-spin motion-reduce:animate-none',
        )}
      />
      {t(`documentStatus.${status}`)}
    </Badge>
  );
}

import { LoaderCircle } from 'lucide-react';
import type * as React from 'react';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useT();

  return (
    <LoaderCircle
      role="status"
      aria-label={t('states.loading')}
      data-slot="spinner"
      className={cn(
        'size-4 animate-spin motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };

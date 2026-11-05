import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

export const primaryAction =
  'bg-foreground text-background shadow-none hover:bg-brand hover:text-brand-foreground';

export const secondaryAction =
  'border-foreground/25 bg-transparent shadow-none hover:border-foreground hover:bg-transparent';

export function Crosshair({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute z-10 size-[13px]', className)}
    >
      <span className="absolute top-[6px] left-0 h-px w-full bg-foreground/45" />
      <span className="absolute top-0 left-[6px] h-full w-px bg-foreground/45" />
    </span>
  );
}

export function FrameCorners() {
  return (
    <>
      <Crosshair className="-top-[7px] -left-[7px]" />
      <Crosshair className="-top-[7px] -right-[7px]" />
    </>
  );
}

export function FrameSection({
  id,
  className,
  innerClassName,
  children,
}: Readonly<{
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}>) {
  return (
    <section id={id} className={cn('scroll-mt-16 border-t', className)}>
      <div
        className={cn('relative mx-auto max-w-7xl border-x', innerClassName)}
      >
        <FrameCorners />
        {children}
      </div>
    </section>
  );
}

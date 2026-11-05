import { cn } from '~/lib/utils';

export function SectionHeading({
  title,
  description,
  align = 'center',
  className,
}: Readonly<{
  title: string;
  description?: string;
  align?: 'center' | 'start';
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'max-w-3xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      <h2 className="text-[2.25rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-[3.5rem]">
        {title}
      </h2>
      {description && (
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

import { cn } from '~/lib/utils';

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: Readonly<{
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'start';
}>) {
  return (
    <div
      className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}
    >
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';

export function DocumentDetailSection({
  title,
  children,
}: Readonly<{ title?: string; children: ReactNode }>) {
  return (
    <section className="space-y-3 p-5">
      {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
      {children}
    </section>
  );
}

export function DocumentDetailRow({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

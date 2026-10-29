import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: Readonly<{
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        {eyebrow ? <div className="text-sm font-medium text-brand">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

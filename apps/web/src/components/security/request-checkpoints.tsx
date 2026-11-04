import {
  Building2,
  Check,
  Database,
  KeyRound,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const checkpoints = [
  { key: 'session', icon: KeyRound },
  { key: 'membership', icon: Building2 },
  { key: 'role', icon: UserCog },
  { key: 'scope', icon: Database },
] as const;

export function RequestCheckpoints({
  animated = false,
  className,
  showEndpoint = true,
}: Readonly<{
  animated?: boolean;
  className?: string;
  showEndpoint?: boolean;
}>) {
  const t = useT();
  return (
    <figure
      aria-label={t('security.checkpoints.label')}
      className={cn(
        'overflow-hidden rounded-2xl border bg-card shadow-xl shadow-brand/5',
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-5 py-3">
        <span className="text-xs text-muted-foreground">
          {t('security.checkpoints.request')}
        </span>
        {showEndpoint && (
          <code className="rounded-md border bg-background px-2 py-0.5 font-mono text-[0.7rem] text-foreground">
            GET /organizations/:id/documents
          </code>
        )}
      </figcaption>
      <ol className="relative px-5 py-5">
        <span
          aria-hidden="true"
          className="absolute top-9 bottom-9 left-[2.375rem] w-px bg-border"
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-9 bottom-9 left-[2.375rem] w-px origin-top bg-brand',
            animated && 'checkpoint-rail',
          )}
        />
        {checkpoints.map(({ key, icon: Icon }, index) => (
          <li key={key} className="relative flex items-center gap-4 py-2.5">
            <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card text-brand shadow-sm">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {t(`security.checkpoints.${key}.title`)}
              </span>
              <span className="block text-xs text-pretty text-muted-foreground">
                {t(`security.checkpoints.${key}.detail`)}
              </span>
            </span>
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[0.7rem] font-medium text-success',
                animated && 'checkpoint-pass',
              )}
              style={
                animated
                  ? { animationDelay: `${300 + index * 180}ms` }
                  : undefined
              }
            >
              <Check className="size-3" />
              {t('security.checkpoints.passed')}
            </span>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-3 border-t bg-brand/5 px-5 py-4 text-sm font-medium">
        <ShieldCheck className="size-5 shrink-0 text-brand" />
        {t('security.checkpoints.result')}
      </p>
    </figure>
  );
}

import { Brand } from '~/components/brand';
import { Spinner } from '~/components/ui/spinner';

export function RoutePending() {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <Brand />
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading…
      </span>
    </div>
  );
}

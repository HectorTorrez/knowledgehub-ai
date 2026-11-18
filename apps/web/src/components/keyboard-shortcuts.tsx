import { useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useT } from '~/lib/i18n/hooks';
import type { Messages } from '~/lib/i18n/messages/schema';
import type { MessageKey } from '~/lib/i18n/types';
import { resolveShortcut } from '~/lib/keyboard-shortcuts';
import { shortcutLabel } from '~/lib/shortcut-label';
import { isTypingTarget } from '~/lib/typing-target';

interface ShortcutRow {
  keys: string[][];
  label: MessageKey<Messages>;
}

const NAVIGATION_ROWS: Array<ShortcutRow & { requiresInsights?: true }> = [
  { keys: [['G'], ['H']], label: 'shortcuts.items.overview' },
  { keys: [['G'], ['D']], label: 'shortcuts.items.documents' },
  { keys: [['G'], ['A']], label: 'shortcuts.items.ask' },
  { keys: [['G'], ['S']], label: 'shortcuts.items.search' },
  {
    keys: [['G'], ['I']],
    label: 'shortcuts.items.insights',
    requiresInsights: true,
  },
  { keys: [['G'], [',']], label: 'shortcuts.items.settings' },
];

const ASK_ROWS: ShortcutRow[] = [
  { keys: [['Enter']], label: 'shortcuts.items.send' },
  { keys: [['Shift', 'Enter']], label: 'shortcuts.items.newLine' },
  { keys: [['Esc']], label: 'shortcuts.items.cancelEdit' },
];

export function KeyboardShortcuts({
  organizationId,
  canViewInsights,
  open,
  onOpenChange,
}: Readonly<{
  organizationId?: string;
  canViewInsights: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useT();
  const navigate = useNavigate();
  const chordStartedAt = useRef<number | null>(null);
  const [paletteKeys, setPaletteKeys] = useState(['Ctrl', 'K']);

  useEffect(() => {
    setPaletteKeys(
      shortcutLabel(navigator.platform) === '⌘K' ? ['⌘', 'K'] : ['Ctrl', 'K'],
    );
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      const action = resolveShortcut(
        event,
        chordStartedAt.current,
        event.timeStamp,
      );
      chordStartedAt.current = null;

      switch (action.type) {
        case 'help':
          event.preventDefault();
          onOpenChange(true);
          return;
        case 'chord':
          chordStartedAt.current = event.timeStamp;
          return;
        case 'navigate':
          if (
            organizationId === undefined ||
            (action.to.endsWith('/insights') && !canViewInsights)
          ) {
            return;
          }
          event.preventDefault();
          onOpenChange(false);
          void navigate({ to: action.to, params: { organizationId } });
          return;
        case 'none':
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canViewInsights, navigate, onOpenChange, organizationId]);

  const generalRows: ShortcutRow[] = [
    { keys: [paletteKeys], label: 'shortcuts.items.palette' },
    { keys: [['?']], label: 'shortcuts.items.help' },
    { keys: [['/']], label: 'shortcuts.items.focus' },
  ];
  const navigationRows = NAVIGATION_ROWS.filter(
    (row) => !row.requiresInsights || canViewInsights,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <ShortcutGroup
            title={t('shortcuts.groups.general')}
            rows={generalRows}
          />
          {organizationId !== undefined ? (
            <ShortcutGroup
              title={t('shortcuts.groups.navigation')}
              rows={navigationRows}
            />
          ) : null}
          <ShortcutGroup title={t('shortcuts.groups.ask')} rows={ASK_ROWS} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroup({
  title,
  rows,
}: Readonly<{ title: string; rows: ShortcutRow[] }>) {
  const t = useT();

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
          >
            <dt>{t(row.label)}</dt>
            <dd className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {row.keys.map((combo, index) => (
                <Fragment key={combo.join('+')}>
                  {index > 0 ? <span>{t('shortcuts.then')}</span> : null}
                  <span className="flex items-center gap-1">
                    {combo.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[11px] font-medium text-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

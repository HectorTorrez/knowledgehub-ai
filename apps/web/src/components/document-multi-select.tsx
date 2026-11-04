import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Label } from '~/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { useT } from '~/lib/i18n/provider';
import { cn } from '~/lib/utils';

export type DocumentOption = Readonly<{ id: string; title: string }>;

export function DocumentMultiSelect({
  documents,
  selectedIds,
  onChange,
  maxSelected = 20,
  label,
  emptyLabel,
  disabled = false,
}: Readonly<{
  documents: ReadonlyArray<DocumentOption>;
  selectedIds: ReadonlyArray<string>;
  onChange: (next: Array<string>) => void;
  maxSelected?: number;
  label?: string;
  emptyLabel?: string;
  disabled?: boolean;
}>) {
  const t = useT();
  const labelId = useId();
  const resolvedLabel = label ?? t('multiSelect.documents');
  const summary =
    selectedIds.length === 0
      ? (emptyLabel ?? t('multiSelect.allReady'))
      : selectedIds.length === 1
        ? (documents.find((document) => document.id === selectedIds[0])
            ?.title ?? t('multiSelect.selected', { count: 1 }))
        : t('multiSelect.selected', { count: selectedIds.length });

  const atLimit = selectedIds.length >= maxSelected;

  function toggle(documentId: string) {
    if (selectedIds.includes(documentId)) {
      onChange(selectedIds.filter((id) => id !== documentId));
      return;
    }

    if (!atLimit) {
      onChange([...selectedIds, documentId]);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{resolvedLabel}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-labelledby={labelId}
            disabled={disabled || documents.length === 0}
            className="w-full justify-between font-normal sm:w-64"
          >
            <span className="truncate">{summary}</span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0 sm:w-64"
        >
          <Command>
            <CommandInput
              placeholder={`${t('multiSelect.search', { label: resolvedLabel.toLowerCase() })}…`}
              aria-label={t('multiSelect.search', {
                label: resolvedLabel.toLowerCase(),
              })}
            />
            <CommandList>
              <CommandEmpty>{t('multiSelect.noMatches')}</CommandEmpty>
              <CommandGroup>
                {documents.map((document) => {
                  const selected = selectedIds.includes(document.id);
                  return (
                    <CommandItem
                      key={document.id}
                      value={document.id}
                      keywords={[document.title]}
                      data-checked={selected}
                      disabled={!selected && atLimit}
                      onSelect={() => toggle(document.id)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-sm border border-input',
                          selected &&
                            'border-primary bg-primary text-primary-foreground',
                        )}
                      >
                        {selected ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <span className="truncate">{document.title}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

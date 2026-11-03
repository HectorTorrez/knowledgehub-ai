import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utils';

export function DatePicker({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder = 'Any date',
  min,
  max,
  className,
}: Readonly<{
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: Date;
  max?: Date;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const selected = value === '' ? undefined : parseISO(value);
  const disabled = [
    ...(min === undefined ? [] : [{ before: min }]),
    ...(max === undefined ? [] : [{ after: max }]),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-start font-normal sm:w-44',
            selected === undefined && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span className="truncate">
            {selected === undefined ? placeholder : format(selected, 'MMM d, yyyy')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          startMonth={new Date(1970, 0, 1)}
          endMonth={max ?? new Date()}
          disabled={disabled}
          onSelect={(date) => {
            onChange(date === undefined ? '' : format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
        {selected === undefined ? null : (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

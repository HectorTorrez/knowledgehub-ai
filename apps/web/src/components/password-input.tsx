import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '~/components/ui/input';

export function PasswordInput({
  id,
  name,
  autoComplete,
  value,
  onChange,
  autoFocus,
  describedBy,
}: Readonly<{
  id: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  describedBy?: string;
}>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        className="pr-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {visible ? (
          <EyeOff className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
      </button>
    </div>
  );
}

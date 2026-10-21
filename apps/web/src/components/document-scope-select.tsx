import type { DocumentSummary } from '@knowledgehub/shared-types';
import { FileText } from 'lucide-react';
import { ALL_DOCUMENTS } from '~/lib/document-scope';
import { cn } from '~/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export function DocumentScopeSelect({
  documents,
  value,
  onValueChange,
  disabled,
  variant = 'default',
}: Readonly<{
  documents: DocumentSummary[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  variant?: 'default' | 'compact';
}>) {
  const compact = variant === 'compact';

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id="document-scope"
        aria-label="Answer from"
        className={cn(
          compact
            ? 'h-11 max-w-[68%] gap-1.5 rounded-lg border-0 bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:bg-accent focus-visible:ring-2 sm:h-8'
            : 'w-full sm:w-80',
        )}
      >
        {compact ? <FileText className="size-3.5 shrink-0" /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DOCUMENTS}>All documents</SelectItem>
        {documents.map((document) => (
          <SelectItem key={document.id} value={document.id}>
            {document.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

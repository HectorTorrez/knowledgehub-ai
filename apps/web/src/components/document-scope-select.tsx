import type { DocumentSummary } from '@knowledgehub/shared-types';
import { ALL_DOCUMENTS } from '~/lib/document-scope';
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
}: Readonly<{
  documents: DocumentSummary[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}>) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id="document-scope"
        aria-label="Answer from"
        className="w-full sm:w-80"
      >
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

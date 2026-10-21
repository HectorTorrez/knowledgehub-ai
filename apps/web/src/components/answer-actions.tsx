import type { AnswerCitation, AnswerResponse } from '@knowledgehub/shared-types';
import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { useToast } from '~/components/ui/toast';
import {
  answerPermalink,
  buildAnswerMarkdown,
} from '~/lib/answer-markdown';

export function AnswerActions({
  organizationId,
  answerId,
  question,
  answer,
  status,
  citations,
}: Readonly<{
  organizationId: string;
  answerId?: string;
  question: string;
  answer: string | null;
  status: AnswerResponse['status'];
  citations: AnswerCitation[];
}>) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<'answer' | 'link' | null>(null);

  async function copy(value: string, kind: 'answer' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
      toast({
        variant: 'success',
        title: kind === 'answer' ? 'Answer copied' : 'Link copied',
        description:
          kind === 'answer'
            ? 'The answer and its sources are on your clipboard.'
            : 'Share it with anyone who can access this organization.',
      });
    } catch {
      toast({
        variant: 'error',
        title: 'Could not copy',
        description: 'Your browser blocked clipboard access.',
      });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Copy answer to “${question}”`}
        onClick={() =>
          void copy(
            buildAnswerMarkdown({ question, answer, status, citations }),
            'answer',
          )
        }
      >
        {copied === 'answer' ? (
          <Check className="size-4 text-success" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
      {answerId !== undefined ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copy link to “${question}”`}
          onClick={() =>
            void copy(
              answerPermalink(
                window.location.origin,
                organizationId,
                answerId,
              ),
              'link',
            )
          }
        >
          {copied === 'link' ? (
            <Check className="size-4 text-success" />
          ) : (
            <Link2 className="size-4" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

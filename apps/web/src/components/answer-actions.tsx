import type {
  AnswerCitation,
  AnswerFeedbackSummary,
  AnswerFeedbackValue,
  AnswerResponse,
} from '@knowledgehub/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { useToast } from '~/components/ui/toast';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';
import { cn } from '~/lib/utils';
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

export function AnswerFeedback({
  organizationId,
  answerId,
  initial,
}: Readonly<{
  organizationId: string;
  answerId: string;
  initial?: AnswerFeedbackSummary | null;
}>) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<AnswerFeedbackSummary | null>(
    initial ?? null,
  );

  const rate = useMutation({
    mutationFn: (value: AnswerFeedbackValue) =>
      answersApi.setFeedback(organizationId, answerId, { value }),
    onSuccess: (data) => {
      setFeedback(data.feedback);
    },
    onError: () => {
      toast({
        variant: 'error',
        title: 'Could not save your feedback',
        description: 'Try again in a moment.',
      });
    },
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.detail(
          organizationId,
          answerId,
        ),
      }),
  });

  const clear = useMutation({
    mutationFn: () => answersApi.clearFeedback(organizationId, answerId),
    onSuccess: () => setFeedback(null),
    onError: () => {
      toast({
        variant: 'error',
        title: 'Could not remove your feedback',
        description: 'Try again in a moment.',
      });
    },
    onSettled: () =>
      client.invalidateQueries({
        queryKey: queryKeys.organizations.answers.detail(
          organizationId,
          answerId,
        ),
      }),
  });

  const pending = rate.isPending || clear.isPending;

  function toggle(value: AnswerFeedbackValue) {
    if (pending) {
      return;
    }

    if (feedback?.value === value) {
      clear.mutate();
      return;
    }

    rate.mutate(value);
  }

  return (
    <div
      role="group"
      aria-label="Rate this answer"
      className="flex items-center gap-1"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Helpful"
        aria-pressed={feedback?.value === 'UP'}
        disabled={pending}
        onClick={() => toggle('UP')}
      >
        <ThumbsUp
          className={cn(
            'size-4',
            feedback?.value === 'UP' && 'fill-current text-success',
          )}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Not helpful"
        aria-pressed={feedback?.value === 'DOWN'}
        disabled={pending}
        onClick={() => toggle('DOWN')}
      >
        <ThumbsDown
          className={cn(
            'size-4',
            feedback?.value === 'DOWN' && 'fill-current text-destructive',
          )}
        />
      </Button>
    </div>
  );
}

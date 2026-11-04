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
import { useT } from '~/lib/i18n/hooks';
import { answersApi } from '~/lib/api/answers';
import { queryKeys } from '~/lib/api/query-keys';
import { cn } from '~/lib/utils';
import { answerPermalink, buildAnswerMarkdown } from '~/lib/answer-markdown';

export function AnswerActions({
  organizationId,
  answerId,
  question,
  answer,
  status,
  citations,
  missing = [],
}: Readonly<{
  organizationId: string;
  answerId?: string;
  question: string;
  answer: string | null;
  status: AnswerResponse['status'];
  citations: AnswerCitation[];
  missing?: string[];
}>) {
  const t = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState<'answer' | 'link' | null>(null);

  async function copy(value: string, kind: 'answer' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
      toast({
        variant: 'success',
        title:
          kind === 'answer'
            ? t('answerActions.answerCopied')
            : t('answerActions.linkCopied'),
        description:
          kind === 'answer'
            ? t('answerActions.answerCopiedDescription')
            : t('answerActions.linkCopiedDescription'),
      });
    } catch {
      toast({
        variant: 'error',
        title: t('answerActions.couldNotCopy'),
        description: t('answerActions.clipboardBlocked'),
      });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('answerActions.copyAnswerFor', { question })}
        title={t('answerActions.copyAnswer')}
        onClick={() =>
          void copy(
            buildAnswerMarkdown(
              {
                question,
                answer,
                status,
                citations,
                missing,
              },
              t,
            ),
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
          aria-label={t('answerActions.copyLinkFor', { question })}
          title={t('answerActions.copyLink')}
          onClick={() =>
            void copy(
              answerPermalink(window.location.origin, organizationId, answerId),
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
  const t = useT();
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
        title: t('answerActions.saveFeedbackError'),
        description: t('answerActions.tryAgainLater'),
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
        title: t('answerActions.removeFeedbackError'),
        description: t('answerActions.tryAgainLater'),
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
      aria-label={t('answerActions.rate')}
      className="flex items-center gap-1"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('answerActions.helpful')}
        title={t('answerActions.helpful')}
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
        aria-label={t('answerActions.notHelpful')}
        title={t('answerActions.notHelpful')}
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

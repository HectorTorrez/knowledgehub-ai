import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { MessageSquareText, ThumbsDown } from 'lucide-react';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { RouteError } from '~/components/route-states';
import { PageHeader } from '~/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
import { getInsights } from '~/lib/api/insights';
import { formatDateTime } from '~/lib/format';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId/insights',
)({ component: InsightsPage });

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

function InsightsPage() {
  const { organizationId } = Route.useParams();
  const [days, setDays] = useState(30);
  const insights = useQuery({
    queryKey: ['insights', organizationId, days],
    queryFn: () => getInsights(organizationId, days),
  });
  useQueryErrorToast(insights.error, () => void insights.refetch());
  const totals = insights.data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge insights"
        description="Explore questions and feedback across your organization."
      />

      <div className="flex items-center gap-2">
        <Label htmlFor="insights-window">Time window</Label>
        <Select
          value={String(days)}
          onValueChange={(value) => setDays(Number(value))}
        >
          <SelectTrigger id="insights-window" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((window) => (
              <SelectItem key={window.value} value={window.value}>
                {window.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {insights.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
          <Skeleton className="h-40 w-full sm:col-span-2 lg:col-span-5" />
          <Skeleton className="h-40 w-full sm:col-span-2 lg:col-span-5" />
        </div>
      ) : null}
      {insights.isError ? (
        <RouteError
          title="Unable to load insights"
          onRetry={() => void insights.refetch()}
        />
      ) : null}

      {totals && insights.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries({
              'Questions asked': totals.questionsAsked,
              Answered: totals.answered,
              'Insufficient evidence': totals.insufficientEvidence,
              Helpful: totals.helpfulFeedback,
              Unhelpful: totals.unhelpfulFeedback,
            }).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Unanswered questions</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.data.unansweredQuestions.length === 0 ? (
                <EmptyState
                  icon={MessageSquareText}
                  title="No unanswered questions"
                  description="There are no unanswered questions in this window."
                  action={
                    <Button asChild>
                      <Link
                        to="/organizations/$organizationId/ask"
                        params={{ organizationId }}
                      >
                        Ask a question
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {insights.data.unansweredQuestions.map((item) => (
                    <li className="py-3" key={item.answerId}>
                      <p>{item.question}</p>
                      <Link
                        className="text-sm text-brand underline"
                        to="/organizations/$organizationId/ask"
                        params={{ organizationId }}
                        search={{ q: item.question }}
                      >
                        Ask again
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(item.askedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Negative feedback</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.data.negativeFeedback.length === 0 ? (
                <EmptyState
                  icon={ThumbsDown}
                  title="No negative feedback"
                  description="There is no negative feedback in this window."
                  action={
                    <Button asChild>
                      <Link
                        to="/organizations/$organizationId/ask"
                        params={{ organizationId }}
                      >
                        Ask a question
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {insights.data.negativeFeedback.map((item, index) => (
                    <li className="py-3" key={`${item.answerId}-${index}`}>
                      <p>{item.question}</p>
                      {item.comment ? (
                        <p className="text-sm">{item.comment}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

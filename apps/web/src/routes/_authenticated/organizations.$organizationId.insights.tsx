import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '~/components/page-header';
import { ErrorNotice } from '~/components/route-states';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { getInsights } from '~/lib/api/insights';
import { formatDateTime } from '~/lib/format';

export const Route = createFileRoute('/_authenticated/organizations/$organizationId/insights')({ component: InsightsPage });

function InsightsPage() {
  const { organizationId } = Route.useParams();
  const [days, setDays] = useState(30);
  const insights = useQuery({ queryKey: ['insights', organizationId, days], queryFn: () => getInsights(organizationId, days) });
  const totals = insights.data?.totals;
  return <div className="space-y-6">
    <PageHeader title="Knowledge insights" description="Explore questions and feedback across your organization." />
    <label className="flex items-center gap-2 text-sm">Time window <select className="rounded-md border bg-background p-2" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
    {insights.isPending ? <Skeleton className="h-24 w-full" /> : null}
    {insights.isError ? <ErrorNotice error={insights.error} onRetry={() => void insights.refetch()} /> : null}
    {totals && insights.data ? <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries({ 'Questions asked': totals.questionsAsked, Answered: totals.answered, 'Insufficient evidence': totals.insufficientEvidence, Helpful: totals.helpfulFeedback, Unhelpful: totals.unhelpfulFeedback }).map(([label, value]) => <Card key={label}><CardContent className="p-4 pt-4 sm:p-6 sm:pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tracking-tight">{value}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Unanswered questions</CardTitle></CardHeader><CardContent>{insights.data.unansweredQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No unanswered questions in this window.</p> : <ul className="divide-y">{insights.data.unansweredQuestions.map((item) => <li className="py-3" key={item.answerId}><p>{item.question}</p><Link className="text-sm text-brand underline" to="/organizations/$organizationId/ask" params={{ organizationId }} search={{ q: item.question }}>Ask again</Link><p className="text-xs text-muted-foreground">{formatDateTime(item.askedAt)}</p></li>)}</ul>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Negative feedback</CardTitle></CardHeader><CardContent>{insights.data.negativeFeedback.length === 0 ? <p className="text-sm text-muted-foreground">No negative feedback in this window.</p> : <ul className="divide-y">{insights.data.negativeFeedback.map((item, index) => <li className="py-3" key={`${item.answerId}-${index}`}><p>{item.question}</p>{item.comment ? <p className="text-sm">{item.comment}</p> : null}<p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p></li>)}</ul>}</CardContent></Card>
    </> : null}
  </div>;
}

import { useQuery } from '@tanstack/react-query';
import { Calculator, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import { ErrorNotice } from '~/components/route-states';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { aggregationApi } from '~/lib/api/aggregation';
import { queryKeys } from '~/lib/api/query-keys';
import { formatMinorAmount } from '~/lib/format';

export function ContractTotalsCard({
  organizationId,
  documentId,
}: Readonly<{ organizationId: string; documentId: string }>) {
  const [requested, setRequested] = useState(false);

  const totals = useQuery({
    queryKey: queryKeys.organizations.aggregates.contractTotals(
      organizationId,
      documentId,
    ),
    queryFn: () =>
      aggregationApi.contractTotals(organizationId, {
        documentId,
        limit: 200,
      }),
    enabled: requested,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          Contract totals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!requested ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Sum the contract totals extracted from this document. Each amount
              comes from the document row, not from the model.
            </p>
            <Button variant="outline" onClick={() => setRequested(true)}>
              Calculate total
            </Button>
          </div>
        ) : null}

        {requested && totals.isPending ? (
          <div className="space-y-2" role="status">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : null}

        {totals.isError ? (
          <div className="space-y-3">
            <ErrorNotice error={totals.error} />
            <Button variant="outline" onClick={() => void totals.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {totals.data ? (
          <TotalsResult
            data={totals.data}
            onRecalculate={() => void totals.refetch()}
            recalculating={totals.isFetching}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function TotalsResult({
  data,
  onRecalculate,
  recalculating,
}: Readonly<{
  data: ContractTotalsResponse;
  onRecalculate: () => void;
  recalculating: boolean;
}>) {
  const incomplete = data.status === 'partial';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={incomplete ? 'outline' : 'secondary'}>
          {incomplete ? 'Partial coverage' : 'Complete coverage'}
        </Badge>
        <p className="text-xs text-muted-foreground">
          {data.coverage.extracted} of {data.coverage.documents} documents
          extracted
          {data.coverage.failed > 0
            ? ` · ${data.coverage.failed} failed`
            : ''}
          {data.coverage.pending > 0
            ? ` · ${data.coverage.pending} pending`
            : ''}
        </p>
      </div>

      {incomplete ? (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            The total omits at least one document whose facts could not be
            extracted. Treat it as a minimum, not as the organization total.
          </p>
        </div>
      ) : null}

      {data.totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contract totals were found in this document.
        </p>
      ) : (
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {data.totals.map((total) => (
            <div key={total.currency} className="space-y-1">
              <dt className="text-xs text-muted-foreground">
                {total.contractCount} contracts in {total.currency}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatMinorAmount(
                  total.totalMinor,
                  total.currency,
                  total.scale,
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {data.collapsedDuplicates > 0 ? (
        <p className="text-xs text-muted-foreground">
          {data.collapsedDuplicates} duplicate{' '}
          {data.collapsedDuplicates === 1 ? 'fact was' : 'facts were'} collapsed
          by contract id.
        </p>
      ) : null}

      {data.breakdown.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Contract totals with their source page
            </caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Contract
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Client
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Page
                </th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((fact) => (
                <tr
                  key={`${fact.documentId}:${fact.contractId}`}
                  className="border-t"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {fact.contractId}
                  </td>
                  <td className="max-w-72 truncate px-3 py-2" title={fact.label}>
                    {fact.label}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMinorAmount(
                      fact.amountMinor,
                      fact.currency,
                      fact.scale,
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {fact.pageNumber}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data.totalFacts > data.breakdown.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {data.breakdown.length} of {data.totalFacts} contracts. The
          totals above cover all of them.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Totals are per currency. Amounts are never converted.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={recalculating}
          onClick={onRecalculate}
        >
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </Button>
      </div>
    </div>
  );
}

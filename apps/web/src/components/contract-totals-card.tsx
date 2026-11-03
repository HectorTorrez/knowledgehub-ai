import { useQuery } from '@tanstack/react-query';
import { Calculator, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import { Badge } from '~/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { useQueryErrorToast } from '~/hooks/use-error-toast';
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
  useQueryErrorToast(totals.error, () => void totals.refetch());

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
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Partial coverage</AlertTitle>
          <AlertDescription className="text-current">
            The total omits at least one document whose facts could not be
            extracted. Treat it as a minimum, not as the organization total.
          </AlertDescription>
        </Alert>
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
        <div className="rounded-md border">
          <Table>
            <TableCaption className="sr-only">
              Contract totals with their source page
            </TableCaption>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Page</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.breakdown.map((fact) => (
                <TableRow key={`${fact.documentId}:${fact.contractId}`}>
                  <TableCell className="font-mono text-xs">
                    {fact.contractId}
                  </TableCell>
                  <TableCell
                    className="max-w-72 truncate"
                    title={fact.label}
                  >
                    {fact.label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinorAmount(
                      fact.amountMinor,
                      fact.currency,
                      fact.scale,
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fact.pageNumber}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

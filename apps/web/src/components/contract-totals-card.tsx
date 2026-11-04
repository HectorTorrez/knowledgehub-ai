import { useQuery } from '@tanstack/react-query';
import { Calculator, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ContractTotalsResponse } from '@knowledgehub/shared-types';
import { Badge } from '~/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
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

import { useLocale, useT } from '~/lib/i18n/provider';

export function ContractTotalsCard({
  organizationId,
  documentId,
}: Readonly<{ organizationId: string; documentId: string }>) {
  const t = useT();
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
          {t('contract.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!requested ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('contract.intro')}
            </p>
            <Button variant="outline" onClick={() => setRequested(true)}>
              {t('contract.calculate')}
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
  const t = useT();
  const locale = useLocale();
  const incomplete = data.status === 'partial';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={incomplete ? 'outline' : 'secondary'}>
          {incomplete
            ? t('contract.partialBadge')
            : t('contract.completeBadge')}
        </Badge>
        <p className="text-xs text-muted-foreground">
          {t('contract.coverage', {
            extracted: data.coverage.extracted,
            documents: data.coverage.documents,
          })}
          {data.coverage.failed > 0
            ? t('contract.coverageFailed', { count: data.coverage.failed })
            : ''}
          {data.coverage.pending > 0
            ? t('contract.coveragePending', { count: data.coverage.pending })
            : ''}
        </p>
      </div>

      {incomplete ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{t('contract.partialTitle')}</AlertTitle>
          <AlertDescription className="text-current">
            {t('contract.partialDescription')}
          </AlertDescription>
        </Alert>
      ) : null}

      {data.totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('contract.none')}</p>
      ) : (
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {data.totals.map((total) => (
            <div key={total.currency} className="space-y-1">
              <dt className="text-xs text-muted-foreground">
                {t('contract.contractsIn', {
                  count: total.contractCount,
                  currency: total.currency,
                })}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatMinorAmount(
                  total.totalMinor,
                  total.currency,
                  total.scale,
                  locale,
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {data.collapsedDuplicates > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('contract.duplicates', { count: data.collapsedDuplicates })}
        </p>
      ) : null}

      {data.breakdown.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableCaption className="sr-only">
              {t('contract.tableCaption')}
            </TableCaption>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t('contract.contract')}</TableHead>
                <TableHead>{t('contract.client')}</TableHead>
                <TableHead className="text-right">
                  {t('contract.total')}
                </TableHead>
                <TableHead className="text-right">
                  {t('contract.page')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.breakdown.map((fact) => (
                <TableRow key={`${fact.documentId}:${fact.contractId}`}>
                  <TableCell className="font-mono text-xs">
                    {fact.contractId}
                  </TableCell>
                  <TableCell className="max-w-72 truncate" title={fact.label}>
                    {fact.label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinorAmount(
                      fact.amountMinor,
                      fact.currency,
                      fact.scale,
                      locale,
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
          {t('contract.showing', {
            shown: data.breakdown.length,
            total: data.totalFacts,
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('contract.perCurrency')}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={recalculating}
          onClick={onRecalculate}
        >
          {recalculating
            ? t('contract.recalculating')
            : t('contract.recalculate')}
        </Button>
      </div>
    </div>
  );
}

import type { AnswerCitation, AnswerResponse } from '@knowledgehub/shared-types';
import {
  formatCalculationValue,
  type CalculationPlan,
  type CalculationResult,
  type NumericFactRow,
} from '../aggregation/calculation.js';
import { buildExcerpt } from './answer-citation.js';

const OPERATIONS = {
  sum: ['suma', 'sum'],
  average: ['promedio', 'average'],
  min: ['mínimo', 'minimum'],
  max: ['máximo', 'maximum'],
  count: ['recuento', 'count'],
  difference: ['diferencia', 'difference'],
  percentage: ['porcentaje', 'percentage'],
} as const;

export function buildCalculationAnswer(
  result: Extract<CalculationResult, { status: 'ok' }>,
  plan: CalculationPlan,
  facts: NumericFactRow[],
  language: 'es' | 'en',
): AnswerResponse {
  const citations: AnswerCitation[] = [];
  const markers = new Map<string, number>();
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const contributing = new Set(
    result.groups.flatMap((group) => group.factIds),
  );
  let capped = false;
  const sentences = result.groups.map((group) => {
    const rows = group.factIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const groupMarkers = new Set<number>();
    for (const row of rows) {
      const key = JSON.stringify([
        row.documentId,
        row.pageNumber,
        row.chunkIndex ?? 0,
      ]);
      let marker = markers.get(key);
      if (!marker && citations.length < 20) {
        marker = citations.length + 1;
        markers.set(key, marker);
        citations.push({
          marker,
          documentId: row.documentId,
          documentTitle: row.documentTitle,
          pageNumber: row.pageNumber,
          chunkIndex: row.chunkIndex ?? 0,
          excerpt: buildExcerpt(row.evidenceText),
        });
      }
      if (!marker) {
        capped = true;
      }
      if (marker) {
        groupMarkers.add(marker);
      }
    }
    const first = rows[0];
    const dimension = JSON.parse(group.key) as [string | null, string | null, string];
    let label = dimension[2];
    if (plan.groupBy === 'entity') {
      label = first?.entityLabel ?? label;
    } else if (plan.groupBy === 'document') {
      label = first?.documentTitle ?? label;
    }
    const suffix = plan.groupBy !== 'none' && label ? ` (${label})` : '';
    let currency = group.currency;
    let unit = group.unit;
    if (plan.operation === 'count') {
      currency = null;
      unit = null;
    } else if (plan.operation === 'percentage') {
      currency = null;
      unit = '%';
    }
    const value = formatCalculationValue(
      group.valueMinor,
      group.scale,
      currency,
      unit,
      language === 'es' ? 'es-ES' : 'en-US',
    );
    const operation = OPERATIONS[plan.operation][language === 'es' ? 0 : 1];
    const field = first?.fieldLabel ?? plan.fields.join(', ');
    const refs = [...groupMarkers].map((marker) => `[${marker}]`).join('');
    if (language === 'es') {
      return `La ${operation} de ${field}${suffix} es ${value} sobre ${group.count} valores${refs ? ` ${refs}` : ''}.`;
    }
    return `The ${operation} of ${field}${suffix} is ${value} across ${group.count} values${refs ? ` ${refs}` : ''}.`;
  });
  if (capped) {
    sentences.push(language === 'es'
      ? `Las citas muestran los primeros 20 de ${contributing.size} valores.`
      : `The citations show the first 20 of ${contributing.size} values.`);
  }
  return { status: 'answered', answer: sentences.join(' '), citations };
}

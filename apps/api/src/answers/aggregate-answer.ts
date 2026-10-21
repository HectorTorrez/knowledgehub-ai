import type {
  AggregateSource,
  AnswerCitation,
  AnswerResponse,
  ContractTotalsResponse,
} from '@knowledgehub/shared-types';
import { buildExcerpt } from './answer-citation.js';

const AGGREGATE_PATTERNS = [
  /\b(suma|sumar|sumatoria)\b/i,
  /\bcu[aá]nto\s+suman\b/i,
  /\b(cu[aá]nto|what)\s+(es|is)\s+el\s+total\b/i,
  /\b(total|monto)\s+(general|global)\b/i,
  /\bgrand\s+total\b/i,
  /\b(en|overall)\s+total\b/i,
  /\btotal\s+de\s+(todos|todas|los|las)\b/i,
  /\btotal\s+(of|across)\s+(all|the)\b/i,
  /\bdame\s+el\s+monto\s+total\b/i,
  /\bsum\s+(of|across|all)\b/i,
];

const SPECIFIC_RECORD =
  /\b(contrato|contract|gu[ií]a|factura|invoice)\s*(n[uú]m(ero)?\.?|#|:)?\s*[A-Z]{0,4}-?\d{1,6}\b/i;

export function isAggregateQuestion(question: string): boolean {
  if (SPECIFIC_RECORD.test(question)) {
    return false;
  }

  return AGGREGATE_PATTERNS.some((pattern) => pattern.test(question));
}

export function isSpanishQuestion(question: string): boolean {
  if (/[¿¡ñáéíóú]/i.test(question)) {
    return true;
  }

  return /\b(dame|suma|sumar|monto|contratos?|cu[aá]nto|del|los|las)\b/i.test(
    question,
  );
}

export function formatAggregateMoney(
  amountMinor: string,
  currency: string,
  scale: number,
  locale: string,
): string {
  const value = Number(amountMinor) / 10 ** scale;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(value);
  } catch {
    return `${value.toFixed(scale)} ${currency}`;
  }
}

function citationsFromSources(sources: AggregateSource[]): AnswerCitation[] {
  return sources.map((source, index) => ({
    marker: index + 1,
    documentId: source.documentId,
    documentTitle: source.documentTitle,
    pageNumber: source.pageNumber,
    chunkIndex: source.chunkIndex ?? 0,
    excerpt: buildExcerpt(source.excerpt),
  }));
}

function markersForCurrency(
  sources: AggregateSource[],
  citations: AnswerCitation[],
  currency: string,
): string {
  return sources
    .map((source, index) =>
      source.currency === currency
        ? `[${citations[index]?.marker ?? index + 1}]`
        : null,
    )
    .filter((marker): marker is string => marker !== null)
    .join('');
}

export function buildAggregateAnswer(
  aggregate: ContractTotalsResponse,
  question: string,
): AnswerResponse {
  const spanish = isSpanishQuestion(question);
  const locale = spanish ? 'es-ES' : 'en-US';
  const citations = citationsFromSources(aggregate.sources);

  const sentences = aggregate.totals.map((total) => {
    const amount = formatAggregateMoney(
      total.totalMinor,
      total.currency,
      total.scale,
      locale,
    );
    const markers = markersForCurrency(
      aggregate.sources,
      citations,
      total.currency,
    );

    return spanish
      ? `El total en ${total.currency} es ${amount} sobre ${total.contractCount} contratos${markers ? ` ${markers}` : ''}.`
      : `The ${total.currency} total is ${amount} across ${total.contractCount} contracts${markers ? ` ${markers}` : ''}.`;
  });

  if (aggregate.status === 'partial') {
    sentences.push(
      spanish
        ? 'La cobertura es parcial: el total puede omitir documentos cuyos hechos no se pudieron extraer.'
        : 'Coverage is partial: the total may omit documents whose facts could not be extracted.',
    );
  }

  return {
    status: 'answered',
    answer: sentences.join(' '),
    citations,
  };
}

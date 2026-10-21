import { Inject, Injectable, Logger } from '@nestjs/common';
import { currencyScale } from './amount.js';
import {
  FACT_EXTRACTOR,
  FactExtractionUnavailableError,
  type FactExtractor,
} from './fact-extractor.port.js';
import { FactsConfig } from './facts.config.js';
import {
  MAX_FACTS_PER_DOCUMENT,
  hasContractTotalHeader,
  moneyTokenContexts,
  normalizeWhitespace,
  type FactCandidate,
  uncoveredMoneyTokens,
  validateFactDraft,
} from './facts.policy.js';
import {
  type FactsTarget,
  FactsStore,
  type FactRecord,
  type StoredChunk,
  type StoredPage,
} from './facts.store.js';

class FactLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactLimitExceededError';
  }
}

class FactsRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FactsRejectedError';
  }
}

function resolveChunkIndex(
  chunks: StoredChunk[],
  pageNumber: number,
  evidenceText: string,
): number | null {
  const chunk = chunks.find(
    (candidate) =>
      candidate.pageNumber === pageNumber &&
      normalizeWhitespace(candidate.content).includes(evidenceText),
  );

  return chunk?.chunkIndex ?? null;
}

function dedupeByNaturalKey(facts: FactRecord[]): FactRecord[] {
  const byKey = new Map<string, FactRecord>();

  for (const fact of facts) {
    if (!byKey.has(fact.naturalKey)) {
      byKey.set(fact.naturalKey, fact);
    }
  }

  return [...byKey.values()];
}

@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name);

  constructor(
    private readonly config: FactsConfig,
    private readonly store: FactsStore,
    @Inject(FACT_EXTRACTOR) private readonly extractor: FactExtractor,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async extractForDocument(
    target: FactsTarget,
    pages: StoredPage[],
    chunks: StoredChunk[],
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      if (!pages.some((page) => hasContractTotalHeader(page.content))) {
        return await this.store.replaceForDocument(target, [], {
          status: 'READY',
        });
      }

      const currencies = this.config.currencies;
      const facts: FactRecord[] = [];
      let draftCount = 0;
      let coverageIncomplete = false;

      const readPage = async (page: StoredPage, hint?: string) => {
        const result = await this.extractor.extract(
          { pageNumber: page.pageNumber, content: page.content },
          hint === undefined ? undefined : { hint },
        );
        const validated: FactRecord[] = [];

        for (const draft of result.facts) {
          const validation = validateFactDraft(
            draft,
            page.content,
            currencies,
            page.pageNumber,
          );

          if (!validation.ok) {
            continue;
          }

          const fact: FactCandidate = validation.fact;

          validated.push({
            ...fact,
            chunkIndex: resolveChunkIndex(
              chunks,
              page.pageNumber,
              fact.evidenceText,
            ),
            scale: currencyScale(fact.currency),
          });
        }

        return {
          facts: validated,
          uncovered: uncoveredMoneyTokens(
            page.content,
            validated.map((fact) => fact.evidenceText),
          ),
          drafts: result.facts.length,
        };
      };

      for (const page of pages) {
        if (page.content.length > this.config.maxInputChars) {
          throw new FactLimitExceededError(
            `Page ${page.pageNumber} exceeds the fact extraction input limit`,
          );
        }

        if (page.content.trim().length === 0) {
          continue;
        }

        let result = await readPage(page);
        draftCount += result.drafts;

        if (result.uncovered.length > 0) {
          const contexts = moneyTokenContexts(page.content, [
            ...new Set(result.uncovered),
          ]);
          const retry = await readPage(
            page,
            `The previous pass missed the rows containing these amounts: ${contexts.join(
              ' | ',
            )}. Return one fact per contract row, including every one of those rows with its amount exactly as printed.`,
          );
          draftCount += retry.drafts;

          if (
            retry.uncovered.length < result.uncovered.length ||
            (retry.uncovered.length === result.uncovered.length &&
              retry.facts.length > result.facts.length)
          ) {
            result = retry;
          }
        }

        if (draftCount > MAX_FACTS_PER_DOCUMENT) {
          throw new FactLimitExceededError(
            'The document produced too many fact drafts',
          );
        }

        if (result.uncovered.length > 0) {
          coverageIncomplete = true;
        }

        facts.push(...result.facts);

        if (facts.length > MAX_FACTS_PER_DOCUMENT) {
          throw new FactLimitExceededError(
            'The document produced too many facts',
          );
        }
      }

      if (draftCount > 0 && facts.length === 0) {
        throw new FactsRejectedError(
          'The extraction returned drafts but none could be validated',
        );
      }

      return await this.store.replaceForDocument(
        target,
        dedupeByNaturalKey(facts),
        coverageIncomplete
          ? { status: 'FAILED', reason: 'FactCoverageIncomplete' }
          : { status: 'READY' },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'UnknownError';

      this.logger.warn(
        `Fact extraction failed for document ${target.documentId} generation ${target.documentGeneration}: ${reason}`,
      );

      if (error instanceof FactExtractionUnavailableError) {
        return false;
      }

      try {
        await this.store.markFailed(target, reason);
      } catch (markError) {
        this.logger.warn(
          `Could not record the fact extraction failure for document ${target.documentId}`,
          markError,
        );
      }

      return false;
    }
  }
}

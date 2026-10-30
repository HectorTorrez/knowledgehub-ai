import { describe, expect, it, vi } from 'vitest';
import {
  type FactExtractor,
  FactExtractionUnavailableError,
} from './fact-extractor.port.js';
import { FactsConfig } from './facts.config.js';
import { FactsService } from './facts.service.js';
import type { FactsStore, StoredChunk, StoredPage } from './facts.store.js';

const TARGET = {
  organizationId: 'org-1',
  documentId: 'doc-1',
  documentGeneration: 1,
};

const PAGE: StoredPage = {
  pageNumber: 1,
  content:
    'ID Contrato Cliente Monto Total ' +
    '1143 Plan Personalizado $500.00 28/07/2026 ' +
    '1142 Test Company $100.00 28/07/2026',
};

const CHUNK: StoredChunk = {
  chunkIndex: 0,
  pageNumber: 1,
  content: PAGE.content,
};

const DRAFT = {
  contractId: '1143',
  label: 'Plan Personalizado',
  amountText: '$500.00',
  currency: 'USD',
  evidenceText: '1143 Plan Personalizado $500.00 28/07/2026',
};

const SECOND_DRAFT = {
  contractId: '1142',
  label: 'Test Company',
  amountText: '$100.00',
  currency: 'USD',
  evidenceText: '1142 Test Company $100.00 28/07/2026',
};

function usage() {
  return { inputTokens: null, outputTokens: null };
}

function createService(
  overrides: {
    extractor?: Partial<FactExtractor>;
    store?: Partial<FactsStore>;
    enabled?: boolean;
    maxInputChars?: number;
  } = {},
) {
  const extractor = {
    extract: vi.fn(async () => ({
      facts: [DRAFT, SECOND_DRAFT],
      usage: usage(),
    })),
    extractNumeric: vi.fn(async () => ({ facts: [], usage: usage() })),
    ...overrides.extractor,
  } as unknown as FactExtractor;

  const store = {
    replaceForDocument: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
    ...overrides.store,
  } as unknown as FactsStore;

  const config = {
    enabled: overrides.enabled ?? true,
    currencies: new Set(['USD']),
    maxInputChars: overrides.maxInputChars ?? 20_000,
  } as unknown as FactsConfig;

  return {
    service: new FactsService(config, store, extractor),
    extractor,
    store,
  };
}

describe('FactsService', () => {
  it('stores every validated fact with its chunk and scale', async () => {
    const { service, store } = createService();

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(true);
    expect(store.replaceForDocument).toHaveBeenCalledWith(
      TARGET,
      [
        expect.objectContaining({
          naturalKey: '1143',
          amountMinor: 50000n,
          chunkIndex: 0,
          scale: 2,
        }),
        expect.objectContaining({
          naturalKey: '1142',
          amountMinor: 10000n,
          chunkIndex: 0,
          scale: 2,
        }),
      ],
      { status: 'READY' },
    );
  });

  it('deduplicates the same contract extracted twice', async () => {
    const oneRowPage: StoredPage = {
      pageNumber: 1,
      content: 'Monto Total\n1143 Plan Personalizado $500.00 28/07/2026',
    };
    const { service, store } = createService({
      extractor: {
        extract: vi.fn(async () => ({ facts: [DRAFT, DRAFT], usage: usage() })),
      },
    });

    await service.extractForDocument(TARGET, [oneRowPage], [CHUNK]);

    const [, facts] = vi.mocked(store.replaceForDocument).mock.calls[0]!;
    expect(facts).toHaveLength(1);
  });

  it('does nothing when extraction is disabled', async () => {
    const { service, extractor, store } = createService({ enabled: false });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(false);
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(store.replaceForDocument).not.toHaveBeenCalled();
  });

  it('marks the document partial when an amount has no extracted row', async () => {
    const { service, store } = createService({
      extractor: {
        extract: vi.fn(async () => ({ facts: [DRAFT], usage: usage() })),
      },
    });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(true);
    expect(store.replaceForDocument).toHaveBeenCalledWith(
      TARGET,
      [expect.objectContaining({ naturalKey: '1143' })],
      { status: 'FAILED', reason: 'FactCoverageIncomplete' },
    );
  });

  it('repairs a short page with one hinted retry', async () => {
    const extract = vi
      .fn<FactExtractor['extract']>()
      .mockResolvedValueOnce({ facts: [DRAFT], usage: usage() })
      .mockResolvedValueOnce({
        facts: [DRAFT, SECOND_DRAFT],
        usage: usage(),
      });
    const { service, store } = createService({ extractor: { extract } });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(true);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[1]?.[1]?.hint).toContain('$100.00');
    expect(store.replaceForDocument).toHaveBeenCalledWith(
      TARGET,
      expect.arrayContaining([
        expect.objectContaining({ naturalKey: '1143' }),
        expect.objectContaining({ naturalKey: '1142' }),
      ]),
      { status: 'READY' },
    );
  });

  it('leaves a transient provider failure pending for a later retry', async () => {
    const { service, store } = createService({
      extractor: {
        extract: vi.fn(async () => {
          throw new FactExtractionUnavailableError('provider down');
        }),
      },
    });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(false);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('marks the document failed when every draft is rejected', async () => {
    const { service, store } = createService({
      extractor: {
        extract: vi.fn(async () => ({
          facts: [{ ...DRAFT, evidenceText: 'invented row' }],
          usage: usage(),
        })),
      },
    });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(false);
    expect(store.replaceForDocument).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(TARGET, 'FactsRejectedError');
  });

  it('marks the document failed when a page exceeds the input budget', async () => {
    const { service, store } = createService({ maxInputChars: 10 });

    await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(store.markFailed).toHaveBeenCalledWith(
      TARGET,
      'FactLimitExceededError',
    );
  });

  it('runs only the numeric pass on a page without a contract table', async () => {
    const page = {
      pageNumber: 1,
      content:
        'Guía Fecha Cliente Teléfono Dirección Monto ME-000022 $40.00 Pagado',
    };
    const { service, extractor, store } = createService({
      extractor: {
        extractNumeric: vi.fn(async () => ({
          facts: [
            {
              field: 'monto',
              fieldLabel: 'Monto',
              valueText: '$40.00',
              currency: 'USD',
              unit: '',
              entityId: 'ME-000022',
              entityLabel: '',
              date: '',
              isTotal: false,
              evidenceText: 'ME-000022 $40.00 Pagado',
            },
            {
              field: 'monto',
              fieldLabel: 'Monto',
              valueText: '$99.00',
              currency: 'USD',
              unit: '',
              entityId: '',
              entityLabel: '',
              date: '',
              isTotal: false,
              evidenceText: 'not on the page $99.00',
            },
          ],
          usage: usage(),
        })),
      },
    });

    const result = await service.extractForDocument(TARGET, [page], []);

    expect(result).toBe(true);
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(store.replaceForDocument).toHaveBeenCalledWith(
      TARGET,
      [
        expect.objectContaining({
          factType: 'NUMERIC_VALUE',
          field: 'monto',
          amountMinor: 4000n,
          scale: 2,
          currency: 'USD',
          entityId: 'ME-000022',
        }),
      ],
      { status: 'READY' },
    );
  });

  it('keeps contract facts when the numeric pass fails on a page', async () => {
    const { service, store } = createService({
      extractor: {
        extractNumeric: vi.fn(async () => {
          throw new Error('malformed');
        }),
      },
    });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(true);
    const [, facts, status] = vi.mocked(store.replaceForDocument).mock
      .calls[0]!;
    expect(facts).toHaveLength(2);
    expect(status).toEqual({ status: 'READY' });
  });

  it('leaves the document pending when the numeric pass is unavailable', async () => {
    const { service, store } = createService({
      extractor: {
        extractNumeric: vi.fn(async () => {
          throw new FactExtractionUnavailableError('rate limited');
        }),
      },
    });

    const result = await service.extractForDocument(TARGET, [PAGE], [CHUNK]);

    expect(result).toBe(false);
    expect(store.replaceForDocument).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('keeps a zero-fact page as a successful extraction', async () => {
    const { service, store } = createService({
      extractor: {
        extract: vi.fn(async () => ({ facts: [], usage: usage() })),
      },
    });

    const result = await service.extractForDocument(
      TARGET,
      [{ pageNumber: 1, content: 'Monto Total\nNo rows on this page' }],
      [],
    );

    expect(result).toBe(true);
    expect(store.replaceForDocument).toHaveBeenCalledWith(TARGET, [], {
      status: 'READY',
    });
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('skips an empty page without calling the provider', async () => {
    const { service, extractor } = createService();

    await service.extractForDocument(
      TARGET,
      [{ pageNumber: 1, content: '   ' }],
      [],
    );

    expect(extractor.extract).not.toHaveBeenCalled();
  });
});

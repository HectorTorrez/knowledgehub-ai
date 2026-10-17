import { describe, expect, it, vi } from 'vitest';
import { EmbeddingConfig } from '../embeddings/embedding.config.js';
import {
  EmbeddingRejectedError,
  EmbeddingResponseError,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.port.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentChunkStore } from './document-chunk.store.js';

interface QueryTagCall {
  strings: TemplateStringsArray;
  values: unknown[];
}

const DIMENSIONS = 4;

const OWNERSHIP = {
  jobId: 'job-1',
  leaseId: 'lease-1',
  organizationId: 'org-1',
  documentGeneration: 1,
  verifiedStorageKey: 'organizations/org-1/verified',
};

const OWNED = {
  documentId: 'doc-from-job',
  organizationId: 'org-1',
  documentGeneration: 1,
};

const CHUNKS = [
  { pageNumber: 1, chunkIndex: 0, content: 'alpha', characterCount: 5 },
  { pageNumber: 2, chunkIndex: 1, content: 'beta', characterCount: 4 },
];

const vector = (value: number): number[] =>
  Array.from({ length: DIMENSIONS }, () => value);

function sqlOf(call: QueryTagCall): string {
  return call.strings.join('?');
}

function createStore(
  embed: EmbeddingProvider['embed'],
  preview: unknown[] = [OWNED],
  locked: unknown[] = [OWNED],
) {
  const embeddings: EmbeddingProvider = { embed: vi.fn(embed) };
  const previewCalls: QueryTagCall[] = [];
  const queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      previewCalls.push({ strings, values });
      return preview;
    },
  );

  const lockedCalls: QueryTagCall[] = [];
  const executeCalls: QueryTagCall[] = [];
  const txQueryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      lockedCalls.push({ strings, values });
      return locked;
    },
  );
  const executeRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executeCalls.push({ strings, values });
      return 1;
    },
  );
  const transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $queryRaw: txQueryRaw, $executeRaw: executeRaw }),
  );

  const store = new DocumentChunkStore(
    { $queryRaw: queryRaw, $transaction: transaction } as unknown as PrismaService,
    { dimensions: DIMENSIONS } as EmbeddingConfig,
    embeddings,
  );

  return {
    store,
    embeddings,
    previewCalls,
    lockedCalls,
    executeCalls,
    transaction,
  };
}

describe('DocumentChunkStore', () => {
  it('embeds the chunk text and replaces that generation under the job lease', async () => {
    const { store, embeddings, previewCalls, lockedCalls, executeCalls, transaction } =
      createStore(async () => [vector(1), vector(2)]);

    await expect(store.replaceForGeneration(OWNERSHIP, CHUNKS)).resolves.toBe(true);

    expect(embeddings.embed).toHaveBeenCalledWith(['alpha', 'beta']);
    expect(transaction).toHaveBeenCalledTimes(1);

    const preview = sqlOf(previewCalls[0]!);
    expect(preview).toContain('j."leaseId"');
    expect(preview).toContain('d."generation"');
    expect(preview).toContain("d.status = 'PROCESSING'");
    expect(preview).not.toContain('FOR UPDATE');
    expect(previewCalls[0]!.values).toEqual([
      OWNERSHIP.jobId,
      OWNERSHIP.leaseId,
      OWNERSHIP.organizationId,
      OWNERSHIP.documentGeneration,
      OWNERSHIP.verifiedStorageKey,
      OWNERSHIP.organizationId,
      OWNERSHIP.documentGeneration,
      OWNERSHIP.verifiedStorageKey,
    ]);

    expect(sqlOf(lockedCalls[0]!)).toContain('FOR UPDATE OF j, d');

    expect(executeCalls).toHaveLength(3);
    const [remove, first, second] = executeCalls;
    expect(sqlOf(remove!)).toContain('DELETE FROM "DocumentChunk"');
    expect(remove!.values).toEqual([
      OWNED.documentId,
      OWNED.organizationId,
      OWNED.documentGeneration,
    ]);
    expect(sqlOf(first!)).toContain('INSERT INTO "DocumentChunk"');
    expect(sqlOf(first!)).toContain('::vector');
    expect(first!.values).toContain(OWNED.documentId);
    expect(first!.values).toContain('alpha');
    expect(first!.values).toContain('[1,1,1,1]');
    expect(second!.values).toContain('beta');
    expect(second!.values).toContain('[2,2,2,2]');
    expect(executeCalls.map(sqlOf).join('\n')).not.toContain('SUCCEEDED');
    expect(executeCalls.map(sqlOf).join('\n')).not.toContain('READY');
  });

  it('clears a generation when the document yields no chunks', async () => {
    const { store, embeddings, executeCalls } = createStore(async () => []);

    await expect(store.replaceForGeneration(OWNERSHIP, [])).resolves.toBe(true);

    expect(embeddings.embed).toHaveBeenCalledWith([]);
    expect(executeCalls).toHaveLength(1);
    expect(sqlOf(executeCalls[0]!)).toContain('DELETE FROM "DocumentChunk"');
  });

  it('does not embed or write when the job no longer owns the document', async () => {
    const { store, embeddings, transaction } = createStore(async () => [], []);

    await expect(store.replaceForGeneration(OWNERSHIP, CHUNKS)).resolves.toBe(false);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('discards embeddings when the lease is lost before the write', async () => {
    const { store, embeddings, executeCalls } = createStore(
      async () => [vector(1), vector(2)],
      [OWNED],
      [],
    );

    await expect(store.replaceForGeneration(OWNERSHIP, CHUNKS)).resolves.toBe(false);

    expect(embeddings.embed).toHaveBeenCalledOnce();
    expect(executeCalls).toHaveLength(0);
  });

  it('does not write when the provider cannot embed', async () => {
    const { store, transaction } = createStore(async () => {
      throw new EmbeddingResponseError('malformed');
    });

    await expect(store.replaceForGeneration(OWNERSHIP, CHUNKS)).rejects.toBeInstanceOf(
      EmbeddingResponseError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a blank chunk before calling the provider', async () => {
    const { store, embeddings, transaction } = createStore(async () => []);

    await expect(
      store.replaceForGeneration(OWNERSHIP, [
        { pageNumber: 1, chunkIndex: 0, content: '   ', characterCount: 3 },
      ]),
    ).rejects.toBeInstanceOf(EmbeddingRejectedError);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a vector set that cannot be stored', async () => {
    const wrongCount = createStore(async () => [vector(1)]);
    await expect(
      wrongCount.store.replaceForGeneration(OWNERSHIP, CHUNKS),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);
    expect(wrongCount.transaction).not.toHaveBeenCalled();

    const wrongDimension = createStore(async () => [[1, 2, 3], vector(2)]);
    await expect(
      wrongDimension.store.replaceForGeneration(OWNERSHIP, CHUNKS),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);

    const nonFinite = createStore(async () => [[Number.NaN, 0, 0, 0], vector(2)]);
    await expect(
      nonFinite.store.replaceForGeneration(OWNERSHIP, CHUNKS),
    ).rejects.toBeInstanceOf(EmbeddingResponseError);
    expect(nonFinite.transaction).not.toHaveBeenCalled();
  });
});

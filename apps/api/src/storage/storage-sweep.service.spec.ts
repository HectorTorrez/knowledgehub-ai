import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ListedObject, ObjectStorage } from './object-storage.port.js';
import type { StorageConfig } from './storage.config.js';
import { StorageSweepService } from './storage-sweep.service.js';

const VERIFIED = 'organizations/org-1/documents/doc-1/verified/token';

function object(key: string, lastModifiedMs: number): ListedObject {
  return { key, lastModifiedMs };
}

function buildService(options: {
  objects?: ListedObject[];
  referenced?: string[];
  graceMs?: number;
} = {}) {
  const storage = {
    listObjects: vi.fn(
      (_prefix: string) =>
        (async function* () {
          for (const listed of options.objects ?? []) {
            yield listed;
          }
        })(),
    ),
    deleteObject: vi.fn(async () => undefined),
  } as unknown as ObjectStorage;

  const prisma = {
    document: {
      findMany: vi.fn(async () =>
        (options.referenced ?? []).map((key) => ({ storageKey: key })),
      ),
    },
  } as unknown as PrismaService;

  const config = {
    sweepGraceMs: options.graceMs ?? 60_000,
  } as unknown as StorageConfig;

  return {
    service: new StorageSweepService(storage, prisma, config),
    deleteObject: storage.deleteObject,
  };
}

describe('StorageSweepService', () => {
  it('deletes an old unreferenced verified object', async () => {
    const { service, deleteObject } = buildService({
      objects: [object(VERIFIED, Date.now() - 120_000)],
    });

    await expect(service.sweepOnce()).resolves.toBe(1);
    expect(deleteObject).toHaveBeenCalledWith(VERIFIED);
  });

  it('keeps a referenced verified object', async () => {
    const { service, deleteObject } = buildService({
      objects: [object(VERIFIED, Date.now() - 120_000)],
      referenced: [VERIFIED],
    });

    await expect(service.sweepOnce()).resolves.toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('keeps a young unreferenced object within the grace period', async () => {
    const { service, deleteObject } = buildService({
      objects: [object(VERIFIED, Date.now() - 30_000)],
      graceMs: 60_000,
    });

    await expect(service.sweepOnce()).resolves.toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('ignores staging objects', async () => {
    const { service, deleteObject } = buildService({
      objects: [
        object(
          'organizations/org-1/documents/doc-1/staging-token',
          Date.now() - 120_000,
        ),
      ],
    });

    await expect(service.sweepOnce()).resolves.toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

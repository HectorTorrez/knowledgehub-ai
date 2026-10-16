import { Prisma } from '../generated/prisma/client.js';

/**
 * Shapes produced by `@prisma/adapter-pg` 7.10.0 against PostgreSQL 17, which
 * the classification below depends on.
 *
 * `P2010` (raw query failed) carries the driver error at
 * `meta.driverAdapterError.cause`: a deadlock or serialization failure is
 * `kind: 'TransactionWriteConflict'`, while a `lock_timeout` keeps
 * `kind: 'postgres'` and its `55P03` SQLSTATE.
 *
 * `P2028` is the runtime's catch-all. An expired execution timeout carries
 * numeric `timeout`/`timeTaken`; an exhausted `maxWait` carries no metadata at
 * all, so only the runtime message identifies it.
 */
interface DriverAdapterCause {
  kind?: string;
  code?: string;
  originalCode?: string;
}

interface DriverAdapterMeta {
  driverAdapterError?: { cause?: DriverAdapterCause };
}

const TRANSACTION_ACQUISITION_TIMEOUT_MESSAGE =
  'Unable to start a transaction in the given time.';

const POSTGRES_LOCK_NOT_AVAILABLE = '55P03';

const PRISMA_WRITE_CONFLICT = 'P2034';

export function isTransientTransactionFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === PRISMA_WRITE_CONFLICT) {
    return true;
  }

  if (error.code === 'P2010') {
    const cause = (error.meta as DriverAdapterMeta | undefined)
      ?.driverAdapterError?.cause;

    if (cause?.kind === 'TransactionWriteConflict') {
      return true;
    }

    return (
      cause?.kind === 'postgres' &&
      (cause.code === POSTGRES_LOCK_NOT_AVAILABLE ||
        cause.originalCode === POSTGRES_LOCK_NOT_AVAILABLE)
    );
  }

  if (error.code === 'P2028') {
    const meta = error.meta as
      | { timeout?: unknown; timeTaken?: unknown }
      | undefined;

    if (
      typeof meta?.timeout === 'number' &&
      typeof meta?.timeTaken === 'number'
    ) {
      return true;
    }

    return error.message.includes(TRANSACTION_ACQUISITION_TIMEOUT_MESSAGE);
  }

  return false;
}

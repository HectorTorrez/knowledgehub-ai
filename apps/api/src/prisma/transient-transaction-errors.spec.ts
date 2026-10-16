import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { isTransientTransactionFailure } from './transient-transaction-errors.js';

function knownError(
  code: string,
  meta?: Record<string, unknown>,
): unknown {
  return new Prisma.PrismaClientKnownRequestError('adapter error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

function lockTimeoutError(): unknown {
  return knownError('P2010', {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '55P03',
        originalMessage: 'canceling statement due to lock timeout',
        kind: 'postgres',
        code: '55P03',
        severity: 'ERROR',
        message: 'canceling statement due to lock timeout',
      },
    },
  });
}

function writeConflictError(): unknown {
  return knownError('P2010', {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '40P01',
        originalMessage: 'deadlock detected',
        kind: 'TransactionWriteConflict',
      },
    },
  });
}

function executionTimeoutError(): unknown {
  return knownError('P2028', {
    operation: 'query',
    timeout: 2000,
    timeTaken: 4809,
  });
}

function acquisitionTimeoutError(): unknown {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction API error: Unable to start a transaction in the given time.',
    { code: 'P2028', clientVersion: 'test', meta: {} },
  );
}

describe('isTransientTransactionFailure', () => {
  it('recognizes a PostgreSQL lock timeout (55P03) reported as P2010', () => {
    expect(isTransientTransactionFailure(lockTimeoutError())).toBe(true);
  });

  it('recognizes 55P03 when only the original SQLSTATE is present', () => {
    expect(
      isTransientTransactionFailure(
        knownError('P2010', {
          driverAdapterError: {
            cause: { kind: 'postgres', originalCode: '55P03' },
          },
        }),
      ),
    ).toBe(true);
  });

  it('recognizes a deadlock or serialization failure (TransactionWriteConflict)', () => {
    expect(isTransientTransactionFailure(writeConflictError())).toBe(true);
  });

  it('recognizes the dedicated write-conflict report code P2034', () => {
    expect(isTransientTransactionFailure(knownError('P2034'))).toBe(true);
  });

  it('recognizes an interactive transaction execution timeout', () => {
    expect(isTransientTransactionFailure(executionTimeoutError())).toBe(true);
  });

  it('recognizes an exhausted transaction acquisition timeout', () => {
    expect(isTransientTransactionFailure(acquisitionTimeoutError())).toBe(true);
  });

  it('does not classify an arbitrary P2010 raw error', () => {
    expect(
      isTransientTransactionFailure(
        knownError('P2010', {
          driverAdapterError: {
            cause: { kind: 'postgres', code: '23505' },
          },
        }),
      ),
    ).toBe(false);
  });

  it('does not classify P2028 that is not a timeout', () => {
    expect(
      isTransientTransactionFailure(
        new Prisma.PrismaClientKnownRequestError(
          'Transaction not found. Transaction ID is invalid.',
          { code: 'P2028', clientVersion: 'test', meta: {} },
        ),
      ),
    ).toBe(false);
  });

  it('does not classify a P2028 with only partial timeout metadata', () => {
    expect(
      isTransientTransactionFailure(
        knownError('P2028', { timeout: 2000 }),
      ),
    ).toBe(false);
  });

  it('does not classify other Prisma errors or plain errors', () => {
    expect(isTransientTransactionFailure(knownError('P2002'))).toBe(false);
    expect(
      isTransientTransactionFailure(
        knownError('P2025', { driverAdapterError: { cause: { kind: 'postgres' } } }),
      ),
    ).toBe(false);
    expect(isTransientTransactionFailure(new Error('boom'))).toBe(false);
    expect(isTransientTransactionFailure(undefined)).toBe(false);
    expect(isTransientTransactionFailure(null)).toBe(false);
  });
});

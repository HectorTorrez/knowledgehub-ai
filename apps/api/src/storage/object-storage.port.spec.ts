import {
  ObjectStorageIntegrityError,
  ObjectVersionMismatchError,
} from './object-storage.port.js';

describe('object storage port errors', () => {
  it('identifies a version mismatch by type and name', () => {
    const error = new ObjectVersionMismatchError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ObjectVersionMismatchError);
    expect(error.name).toBe('ObjectVersionMismatchError');
  });

  it('identifies an integrity failure by type and name', () => {
    const error = new ObjectStorageIntegrityError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ObjectStorageIntegrityError);
    expect(error.name).toBe('ObjectStorageIntegrityError');
  });

  it('keeps the two failure kinds distinct', () => {
    expect(new ObjectVersionMismatchError()).not.toBeInstanceOf(
      ObjectStorageIntegrityError,
    );
  });

  it('retains a supplied cause for diagnosability', () => {
    const cause = new Error('precondition failed');
    const error = new ObjectVersionMismatchError('mismatch', { cause });

    expect(error.cause).toBe(cause);
  });
});

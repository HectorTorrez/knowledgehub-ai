import {
  ObjectVersionMismatchError,
  type ObjectStorage,
} from '../../src/storage/object-storage.port.js';
import { FakeObjectStorage } from './fake-object-storage.js';

const input = {
  key: 'organizations/org-1/documents/doc-1/2f1c',
  contentType: 'application/pdf',
  expiresInSeconds: 900,
};

const destinationKey = 'organizations/org-1/documents/doc-1/verified/9a0b';

describe('FakeObjectStorage', () => {
  it('satisfies the ObjectStorage port', () => {
    const storage: ObjectStorage = new FakeObjectStorage();

    expect(storage.createPresignedUpload).toBeTypeOf('function');
    expect(storage.inspectObject).toBeTypeOf('function');
    expect(storage.readObjectPrefix).toBeTypeOf('function');
    expect(storage.readObject).toBeTypeOf('function');
    expect(storage.copyObject).toBeTypeOf('function');
  });

  it('returns a PUT presigned upload with the content-type header', async () => {
    const storage = new FakeObjectStorage();

    await expect(storage.createPresignedUpload(input)).resolves.toEqual({
      url: 'https://fake-object-storage.test/organizations/org-1/documents/doc-1/2f1c',
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      expiresAt: new Date('2026-01-01T00:15:00.000Z'),
    });
  });

  it('records the key, content type and expiration of each call', async () => {
    const storage = new FakeObjectStorage();

    await storage.createPresignedUpload(input);
    await storage.createPresignedUpload({
      ...input,
      contentType: 'text/plain',
      expiresInSeconds: 60,
    });

    expect(storage.calls).toEqual([
      {
        key: 'organizations/org-1/documents/doc-1/2f1c',
        contentType: 'application/pdf',
        expiresInSeconds: 900,
        expiresAt: new Date('2026-01-01T00:15:00.000Z'),
      },
      {
        key: 'organizations/org-1/documents/doc-1/2f1c',
        contentType: 'text/plain',
        expiresInSeconds: 60,
        expiresAt: new Date('2026-01-01T00:01:00.000Z'),
      },
    ]);
  });

  it('is deterministic for the same input', async () => {
    const storage = new FakeObjectStorage();

    const first = await storage.createPresignedUpload(input);
    const second = await storage.createPresignedUpload(input);

    expect(first).toEqual(second);
  });

  it('reports absent objects as null', async () => {
    const storage = new FakeObjectStorage();

    await expect(storage.inspectObject(input.key)).resolves.toBeNull();
  });

  it('reports the stored bytes, content type and version', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, '%PDF-1.4', 'application/pdf');

    await expect(storage.inspectObject(input.key)).resolves.toEqual({
      key: input.key,
      sizeBytes: 8,
      contentType: 'application/pdf',
      version,
    });
  });

  it('reads only the requested prefix', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'abcdef', 'text/plain');

    const bytes = await storage.readObjectPrefix({
      key: input.key,
      maxBytes: 3,
      version,
    });

    expect(new TextDecoder().decode(bytes)).toBe('abc');
  });

  it('reads the whole object for the given version', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'abcdef', 'text/plain');

    const bytes = await storage.readObject({ key: input.key, version });

    expect(new TextDecoder().decode(bytes)).toBe('abcdef');
  });

  it('fails the whole-object read when the version no longer matches', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(input.key, 'original', 'text/plain');

    await expect(
      storage.readObject({ key: input.key, version: 'stale' }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
  });

  it('changes the version when the object is overwritten', async () => {
    const storage = new FakeObjectStorage();
    const before = storage.putObject(input.key, 'original', 'application/pdf');
    const after = storage.putObject(input.key, 'replaced', 'application/pdf');

    expect(after).not.toBe(before);
  });

  it('fails the prefix read when the object is overwritten after inspection', async () => {
    const storage = new FakeObjectStorage();
    storage.putObject(input.key, 'original bytes', 'application/pdf');
    const inspected = await storage.inspectObject(input.key);

    storage.putObject(input.key, 'replaced bytes', 'application/pdf');

    await expect(
      storage.readObjectPrefix({
        key: input.key,
        maxBytes: 1024,
        version: inspected?.version ?? '',
      }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
  });

  it('fails the prefix read when the version no longer matches', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'original bytes', 'text/plain');
    storage.putObject(input.key, 'replaced bytes', 'text/plain');

    await expect(
      storage.readObjectPrefix({ key: input.key, maxBytes: 1024, version }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
  });

  it('fails the prefix read when the object is absent', async () => {
    const storage = new FakeObjectStorage();

    await expect(
      storage.readObjectPrefix({
        key: input.key,
        maxBytes: 1024,
        version: 'anything',
      }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
  });

  it('fails the copy when the source is overwritten after the prefix read', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'original bytes', 'text/plain');

    await storage.readObjectPrefix({ key: input.key, maxBytes: 1024, version });
    storage.putObject(input.key, 'replaced bytes', 'text/plain');

    await expect(
      storage.copyObject({
        sourceKey: input.key,
        destinationKey,
        version,
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
    await expect(storage.inspectObject(destinationKey)).resolves.toBeNull();
  });

  it('fails the copy when the source is absent', async () => {
    const storage = new FakeObjectStorage();

    await expect(
      storage.copyObject({
        sourceKey: input.key,
        destinationKey,
        version: 'anything',
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(ObjectVersionMismatchError);
  });

  it('stamps the destination with the supplied verified content type', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'bytes', 'application/pdf');

    await storage.copyObject({
      sourceKey: input.key,
      destinationKey,
      version,
      contentType: 'text/plain',
    });

    const promoted = await storage.inspectObject(destinationKey);
    expect(promoted?.contentType).toBe('text/plain');
  });

  it('promotes the verified bytes to the destination, independent of later changes', async () => {
    const storage = new FakeObjectStorage();
    const version = storage.putObject(input.key, 'verified bytes', 'text/plain');

    await storage.copyObject({
      sourceKey: input.key,
      destinationKey,
      version,
      contentType: 'text/plain',
    });

    await expect(storage.inspectObject(destinationKey)).resolves.toEqual({
      key: destinationKey,
      sizeBytes: 14,
      contentType: 'text/plain',
      version,
    });

    storage.putObject(input.key, 'overwritten', 'text/plain');

    const promoted = await storage.inspectObject(destinationKey);
    const bytes = await storage.readObjectPrefix({
      key: destinationKey,
      maxBytes: 1024,
      version: promoted?.version ?? '',
    });
    expect(new TextDecoder().decode(bytes)).toBe('verified bytes');
  });
});

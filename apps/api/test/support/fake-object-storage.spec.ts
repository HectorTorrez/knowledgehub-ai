import type { ObjectStorage } from '../../src/storage/object-storage.port.js';
import { FakeObjectStorage } from './fake-object-storage.js';

const input = {
  key: 'organizations/org-1/documents/doc-1/2f1c',
  contentType: 'application/pdf',
  expiresInSeconds: 900,
};

describe('FakeObjectStorage', () => {
  it('satisfies the ObjectStorage port', () => {
    const storage: ObjectStorage = new FakeObjectStorage();

    expect(storage.createPresignedUpload).toBeTypeOf('function');
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
});

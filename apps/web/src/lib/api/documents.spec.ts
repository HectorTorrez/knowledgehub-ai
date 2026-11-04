import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { collectionsApi } from './collections';
import { uploadFileToDocument } from './documents';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));
vi.mock('./collections', () => ({
  collectionsApi: { setDocumentCollections: vi.fn() },
}));

const apiFetchMock = vi.mocked(apiFetch);
const setDocumentCollections = vi.mocked(collectionsApi.setDocumentCollections);

const UPLOAD_URL = {
  uploadUrl: 'https://storage.test/documents/doc-1',
  method: 'PUT' as const,
  headers: {},
  expiresAt: '2099-01-01T00:00:00.000Z',
  maxSizeBytes: 1024,
};

class ImmediateXmlHttpRequest {
  status = 200;
  upload = { addEventListener: vi.fn() };
  private readonly listeners = new Map<string, () => void>();

  open() {}

  setRequestHeader() {}

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }

  abort() {}

  send() {
    this.listeners.get('load')?.();
  }
}

function file(): File {
  return new File(['hello'], 'notes.txt', { type: 'text/plain' });
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', ImmediateXmlHttpRequest);
  apiFetchMock.mockImplementation((path: string, options) => {
    if (path.endsWith('/upload-url')) {
      return Promise.resolve(UPLOAD_URL);
    }

    if (path.endsWith('/upload-complete')) {
      return Promise.resolve({ document: { id: 'doc-1' } });
    }

    if (options?.method === 'POST') {
      return Promise.resolve({ document: { id: 'doc-1' } });
    }

    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('uploadFileToDocument', () => {
  it('assigns the uploaded document to the selected collections', async () => {
    setDocumentCollections.mockResolvedValue(undefined);

    await uploadFileToDocument('org-1', 'Notes', file(), {
      contentType: 'text/plain',
      collectionIds: ['collection-1'],
    });

    expect(setDocumentCollections).toHaveBeenCalledWith('org-1', 'doc-1', [
      'collection-1',
    ]);
  });

  it('does not touch collections when none are selected', async () => {
    await uploadFileToDocument('org-1', 'Notes', file(), {
      contentType: 'text/plain',
      collectionIds: [],
    });

    expect(setDocumentCollections).not.toHaveBeenCalled();
  });
});

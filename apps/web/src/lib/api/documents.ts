import type {
  CreateDocumentRequest,
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentStatus,
  DocumentUploadCompleteRequest,
  DocumentUploadUrlRequest,
  DocumentUploadUrlResponse,
  UpdateDocumentRequest,
} from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

function documentsPath(organizationId: string): string {
  return `/organizations/${organizationId}/documents`;
}

export interface ListDocumentsOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: DocumentStatus;
  order?: 'createdAt_desc' | 'createdAt_asc';
}

export const documentsApi = {
  list(
    organizationId: string,
    options: ListDocumentsOptions = {},
  ): Promise<DocumentListResponse> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.cursor) {
      params.set('cursor', options.cursor);
    }
    if (options.q) {
      params.set('q', options.q);
    }
    if (options.status) {
      params.set('status', options.status);
    }
    if (options.order) {
      params.set('order', options.order);
    }

    const query = params.toString();
    return apiFetch<DocumentListResponse>(
      `${documentsPath(organizationId)}${query ? `?${query}` : ''}`,
      {
        authRecovery: true,
        signal: options.signal,
      },
    );
  },

  create(
    organizationId: string,
    input: CreateDocumentRequest,
  ): Promise<DocumentDetailResponse> {
    return apiFetch<DocumentDetailResponse>(documentsPath(organizationId), {
      method: 'POST',
      body: input,
      authRecovery: true,
    });
  },

  detail(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    return apiFetch<DocumentDetailResponse>(
      `${documentsPath(organizationId)}/${documentId}`,
      { authRecovery: true },
    );
  },

  rename(
    organizationId: string,
    documentId: string,
    input: UpdateDocumentRequest,
  ): Promise<DocumentDetailResponse> {
    return apiFetch<DocumentDetailResponse>(
      `${documentsPath(organizationId)}/${documentId}`,
      { method: 'PATCH', body: input, authRecovery: true },
    );
  },

  remove(organizationId: string, documentId: string): Promise<void> {
    return apiFetch<void>(`${documentsPath(organizationId)}/${documentId}`, {
      method: 'DELETE',
      authRecovery: true,
    });
  },

  createUploadUrl(
    organizationId: string,
    documentId: string,
    input: DocumentUploadUrlRequest,
  ): Promise<DocumentUploadUrlResponse> {
    return apiFetch<DocumentUploadUrlResponse>(
      `${documentsPath(organizationId)}/${documentId}/upload-url`,
      { method: 'POST', body: input, authRecovery: true },
    );
  },

  completeUpload(
    organizationId: string,
    documentId: string,
    input: DocumentUploadCompleteRequest,
  ): Promise<DocumentDetailResponse> {
    return apiFetch<DocumentDetailResponse>(
      `${documentsPath(organizationId)}/${documentId}/upload-complete`,
      { method: 'POST', body: input, authRecovery: true },
    );
  },
};

export interface UploadProgressOptions {
  contentType: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export async function uploadFileToDocument(
  organizationId: string,
  title: string,
  file: File,
  options: UploadProgressOptions,
): Promise<DocumentDetailResponse> {
  const created = await documentsApi.create(organizationId, { title });
  const documentId = created.document.id;
  const target = await documentsApi.createUploadUrl(organizationId, documentId, {
    contentType: options.contentType,
    sizeBytes: file.size,
  });

  await putFileWithProgress(target, file, options);

  return documentsApi.completeUpload(organizationId, documentId, {
    originalFileName: file.name,
  });
}

function putFileWithProgress(
  target: DocumentUploadUrlResponse,
  file: File,
  options: UploadProgressOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new DOMException('The upload was cancelled.', 'AbortError'));
      return;
    }

    const request = new XMLHttpRequest();
    request.open(target.method, target.uploadUrl);

    for (const [name, value] of Object.entries(target.headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(event.loaded / event.total);
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(1);
        resolve();
        return;
      }

      reject(
        new Error(`The storage upload failed with status ${request.status}.`),
      );
    });

    request.addEventListener('error', () => {
      reject(new Error('The storage upload failed.'));
    });

    request.addEventListener('abort', () => {
      reject(new DOMException('The upload was cancelled.', 'AbortError'));
    });

    options.signal?.addEventListener('abort', () => request.abort(), {
      once: true,
    });

    request.send(file);
  });
}

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

export async function uploadFileToDocument(
  organizationId: string,
  documentId: string,
  file: File,
): Promise<DocumentDetailResponse> {
  const target = await documentsApi.createUploadUrl(organizationId, documentId, {
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  const response = await fetch(target.uploadUrl, {
    method: target.method,
    headers: target.headers,
    body: file,
  });

  if (!response.ok) {
    throw new Error(`The storage upload failed with status ${response.status}.`);
  }

  return documentsApi.completeUpload(organizationId, documentId, {
    originalFileName: file.name,
  });
}

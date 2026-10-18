import type {
  CreateDocumentRequest,
  DocumentDetailResponse,
  DocumentListResponse,
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

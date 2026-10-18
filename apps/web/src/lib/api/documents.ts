import type {
  CreateDocumentRequest,
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentUploadCompleteRequest,
  DocumentUploadUrlRequest,
  DocumentUploadUrlResponse,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';
import type { RequestOptions } from './organizations';

function documentsPath(organizationId: string): string {
  return `/organizations/${organizationId}/documents`;
}

export const documentsApi = {
  list(
    organizationId: string,
    options: RequestOptions = {},
  ): Promise<DocumentListResponse> {
    return apiFetch<DocumentListResponse>(documentsPath(organizationId), {
      authRecovery: true,
      signal: options.signal,
    });
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

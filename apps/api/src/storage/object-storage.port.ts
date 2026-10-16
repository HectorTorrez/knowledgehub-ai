export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignedUploadInput {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStorage {
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload>;
}

export const MAX_UPLOAD_BYTES = 2_000_000_000;

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

export type AllowedUploadContentType =
  (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

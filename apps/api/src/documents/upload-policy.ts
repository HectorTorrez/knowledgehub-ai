import { MAX_EXTRACTABLE_BYTES } from '../processing/processing-limits.policy.js';

export const MAX_UPLOAD_BYTES = MAX_EXTRACTABLE_BYTES;

export const SIGNATURE_PREFIX_BYTES = 1024;

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

export type AllowedUploadContentType =
  (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

export const UPLOAD_FAILURE_REASONS = [
  'EMPTY_OBJECT',
  'SIZE_LIMIT_EXCEEDED',
  'CONTENT_TYPE_NOT_ALLOWED',
  'CONTENT_TYPE_MISMATCH',
  'SIGNATURE_MISMATCH',
] as const;

export type UploadFailureReason = (typeof UPLOAD_FAILURE_REASONS)[number];

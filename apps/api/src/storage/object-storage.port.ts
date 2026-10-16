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

export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  version: string;
}

export interface ReadObjectPrefixInput {
  key: string;
  maxBytes: number;
  version: string;
}

export interface CopyObjectInput {
  sourceKey: string;
  destinationKey: string;
  version: string;
  contentType: string;
}

/**
 * Opaque object version; equality implies byte identity. Reads and copies are
 * conditioned on it so they fail instead of returning different bytes.
 */
export class ObjectVersionMismatchError extends Error {
  constructor(
    message = 'Object version no longer matches the inspected object',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ObjectVersionMismatchError';
  }
}

/**
 * Thrown when the provider omits the version or size needed to act on an object
 * safely. Callers must not fall back to an unconditioned operation.
 */
export class ObjectStorageIntegrityError extends Error {
  constructor(
    message = 'Object storage omitted information required for verification',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ObjectStorageIntegrityError';
  }
}

export interface ObjectStorage {
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload>;
  inspectObject(key: string): Promise<ObjectMetadata | null>;
  readObjectPrefix(input: ReadObjectPrefixInput): Promise<Uint8Array>;
  copyObject(input: CopyObjectInput): Promise<void>;
}

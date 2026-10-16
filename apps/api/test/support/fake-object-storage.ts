import { createHash } from 'node:crypto';
import {
  ObjectVersionMismatchError,
  type CopyObjectInput,
  type ObjectMetadata,
  type ObjectStorage,
  type PresignedUpload,
  type PresignedUploadInput,
  type ReadObjectPrefixInput,
} from '../../src/storage/object-storage.port.js';

const MS_PER_SECOND = 1_000;
const FAKE_NOW_MS = Date.parse('2026-01-01T00:00:00.000Z');

export interface RecordedPresignedUpload {
  key: string;
  contentType: string;
  expiresInSeconds: number;
  expiresAt: Date;
}

interface StoredObject {
  bytes: Uint8Array;
  contentType: string | null;
  version: string;
}

function versionOf(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

export class FakeObjectStorage implements ObjectStorage {
  readonly calls: RecordedPresignedUpload[] = [];
  onPresign: (() => Promise<void> | void) | null = null;
  private readonly objects = new Map<string, StoredObject>();

  putObject(
    key: string,
    bytes: Uint8Array | string,
    contentType: string | null,
  ): string {
    const data =
      typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    const version = versionOf(data);
    this.objects.set(key, { bytes: data, contentType, version });
    return version;
  }

  removeObject(key: string): void {
    this.objects.delete(key);
  }

  async createPresignedUpload(
    input: PresignedUploadInput,
  ): Promise<PresignedUpload> {
    const expiresAt = new Date(
      FAKE_NOW_MS + input.expiresInSeconds * MS_PER_SECOND,
    );

    this.calls.push({
      key: input.key,
      contentType: input.contentType,
      expiresInSeconds: input.expiresInSeconds,
      expiresAt,
    });

    if (this.onPresign) {
      await this.onPresign();
    }

    return {
      url: `https://fake-object-storage.test/${input.key}`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt,
    };
  }

  async inspectObject(key: string): Promise<ObjectMetadata | null> {
    const object = this.objects.get(key);
    if (!object) {
      return null;
    }

    return {
      key,
      sizeBytes: object.bytes.byteLength,
      contentType: object.contentType,
      version: object.version,
    };
  }

  async readObjectPrefix(input: ReadObjectPrefixInput): Promise<Uint8Array> {
    if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1) {
      throw new RangeError('maxBytes must be a positive integer');
    }

    const object = this.objects.get(input.key);
    if (!object || object.version !== input.version) {
      throw new ObjectVersionMismatchError();
    }

    return object.bytes.slice(0, input.maxBytes);
  }

  async copyObject(input: CopyObjectInput): Promise<void> {
    const source = this.objects.get(input.sourceKey);
    if (!source || source.version !== input.version) {
      throw new ObjectVersionMismatchError();
    }

    this.objects.set(input.destinationKey, {
      bytes: source.bytes.slice(),
      contentType: input.contentType,
      version: source.version,
    });
  }
}

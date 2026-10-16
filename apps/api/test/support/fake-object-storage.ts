import type {
  ObjectStorage,
  PresignedUpload,
  PresignedUploadInput,
} from '../../src/storage/object-storage.port.js';

const MS_PER_SECOND = 1_000;
const FAKE_NOW_MS = Date.parse('2026-01-01T00:00:00.000Z');

export interface RecordedPresignedUpload {
  key: string;
  contentType: string;
  expiresInSeconds: number;
  expiresAt: Date;
}

export class FakeObjectStorage implements ObjectStorage {
  readonly calls: RecordedPresignedUpload[] = [];
  onPresign: (() => Promise<void> | void) | null = null;

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
}

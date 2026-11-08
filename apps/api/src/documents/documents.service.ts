import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  DocumentDetailResponse,
  DocumentDownloadUrlResponse,
  DocumentFailureKind,
  DocumentListResponse,
  DocumentStatus,
  DocumentSummary,
  DocumentUploadUrlResponse,
} from '@knowledgehub/shared-types';
import { parse } from 'node-html-parser';
import { URL_FETCHER } from './url-fetcher.token.js';
import { UrlFetchError, type fetchDocumentUrl } from './url-fetcher.js';
import { DOCUMENT_TITLE_MAX_LENGTH } from './dto/document-title.schema.js';
import type { ImportUrlInput } from './dto/import-url.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsageService } from '../rate-limit/usage.service.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import {
  decodeListCursor,
  encodeListCursor,
  listCursorFilter,
} from '../common/list-cursor.js';
import {
  OBJECT_STORAGE,
  ObjectVersionMismatchError,
  type ObjectStorage,
} from '../storage/object-storage.port.js';
import { StorageConfig } from '../storage/storage.config.js';
import type { CompleteUploadInput } from './dto/complete-upload.schema.js';
import type { CreateDocumentInput } from './dto/create-document.schema.js';
import type { CreateUploadUrlInput } from './dto/create-upload-url.schema.js';
import type { ListDocumentsInput } from './dto/list-documents.schema.js';
import type { UpdateDocumentInput } from './dto/update-document.schema.js';
import { deriveProcessingProgress } from './processing-progress.js';
import { PROCESSING_MAX_ATTEMPTS } from './processing-policy.js';
import {
  createDocumentStorageKey,
  createVerifiedStorageKey,
  isDocumentStagingKey,
  isDocumentVerifiedKey,
} from './upload-key.js';
import {
  MAX_UPLOAD_BYTES,
  SIGNATURE_PREFIX_BYTES,
  type UploadFailureReason,
} from './upload-policy.js';
import {
  evaluateUploadMetadata,
  evaluateUploadSignature,
  evaluateOfficeArchive,
} from './verification-policy.js';

const DOCUMENT_PUBLIC_SELECT = {
  collections: {
    select: { collection: { select: { id: true, name: true, color: true } } },
  },
  id: true,
  title: true,
  status: true,
  sourceUrl: true,
  originalFileName: true,
  contentType: true,
  sizeBytes: true,
  failureReason: true,
  failureKind: true,
  createdAt: true,
  updatedAt: true,
  factsStatus: true,
  summaryStatus: true,
  processingJobs: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      state: true,
      attempt: true,
      maxAttempts: true,
      nextAttemptAt: true,
    },
  },
} as const;

const VERIFIABLE_STATUSES = ['PENDING', 'FAILED'] as const;

interface DocumentProjection {
  collections: Array<{
    collection: { id: string; name: string; color: string };
  }>;
  id: string;
  title: string;
  status: DocumentStatus;
  sourceUrl: string | null;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  failureKind: DocumentFailureKind | null;
  createdAt: Date;
  updatedAt: Date;
  factsStatus: 'PENDING' | 'READY' | 'FAILED';
  summaryStatus: 'PENDING' | 'READY' | 'FAILED';
  processingJobs: Array<{
    state: 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED';
    attempt: number;
    maxAttempts: number;
    nextAttemptAt: Date;
  }>;
}

function toDocumentSummary(document: DocumentProjection): DocumentSummary {
  return {
    id: document.id,
    collections: document.collections.map(({ collection }) => collection),
    title: document.title,
    status: document.status,
    ...deriveProcessingProgress(document),
    sourceUrl: document.sourceUrl,
    originalFileName: document.originalFileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    failureReason: document.failureReason,
    failureKind: document.failureKind,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function isProcessing(status: DocumentStatus): boolean {
  return status === 'PROCESSING' || status === 'READY';
}

function normalizeObjectVersion(version: string): string {
  return version.replace(/^W\//, '').replace(/^"|"$/g, '');
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly storageConfig: StorageConfig,
    private readonly activity: ActivityService,
    private readonly usage: UsageService,
    @Inject(URL_FETCHER) private readonly urlFetcher: typeof fetchDocumentUrl,
  ) {}

  async create(
    context: OrganizationContext,
    input: CreateDocumentInput,
  ): Promise<DocumentDetailResponse> {
    await this.usage.assertDocumentCapacity(context.organizationId);
    const document = await this.prisma.document.create({
      data: {
        organizationId: context.organizationId,
        uploadedById: context.userId,
        title: input.title,
      },
      select: DOCUMENT_PUBLIC_SELECT,
    });

    return { document: toDocumentSummary(document) };
  }

  async importFromUrl(context: OrganizationContext, body: ImportUrlInput): Promise<DocumentDetailResponse> {
    let fetched: Awaited<ReturnType<typeof fetchDocumentUrl>>;
    try {
      fetched = await this.urlFetcher(body.url);
    } catch (error) {
      if (error instanceof UrlFetchError) {
        const Exception = error.code === 'URL_NOT_ALLOWED' ? BadRequestException : UnprocessableEntityException;
        throw new Exception({ code: error.code });
      }
      throw error;
    }
    const url = new URL(fetched.url);
    const htmlTitle = fetched.contentType === 'text/html'
      ? parse(fetched.bytes.subarray(0, 65536).toString('utf8')).querySelector('title')?.text.trim() || ''
      : '';
    const segment = url.pathname.split('/').filter(Boolean).at(-1);
    let pathTitle = '';
    if (segment) {
      try { pathTitle = decodeURIComponent(segment).trim(); } catch { pathTitle = segment; }
    }
    const title = (body.title?.trim() || htmlTitle || pathTitle || url.hostname).slice(0, DOCUMENT_TITLE_MAX_LENGTH);
    await this.usage.assertDocumentCapacity(context.organizationId);
    const document = await this.prisma.document.create({
      data: { organizationId: context.organizationId, uploadedById: context.userId, title, sourceUrl: fetched.url, expectedContentType: fetched.contentType },
      select: { id: true },
    });
    const key = createDocumentStorageKey(context.organizationId, document.id);
    await this.prisma.document.updateMany({ where: { id: document.id, organizationId: context.organizationId }, data: { uploadStorageKey: key } });
    try {
      await this.storage.writeObject({ key, contentType: fetched.contentType, bytes: fetched.bytes });
    } catch (error) {
      await this.prisma.document.updateMany({ where: { id: document.id, organizationId: context.organizationId, uploadStorageKey: key }, data: { status: 'FAILED', failureReason: 'Storage write failed', failureKind: 'VERIFICATION' } });
      throw error;
    }
    return this.finishUpload(context, document.id, {});
  }

  async list(
    organizationId: string,
    input: ListDocumentsInput,
  ): Promise<DocumentListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    if (
      input.collectionId &&
      !(await this.prisma.collection.findFirst({
        where: { id: input.collectionId, organizationId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Collection not found');

    const direction = input.order === 'createdAt_asc' ? 'asc' : 'desc';
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        ...(input.collectionId
          ? {
              collections: {
                some: { organizationId, collectionId: input.collectionId },
              },
            }
          : {}),
        ...(input.q
          ? { title: { contains: input.q, mode: 'insensitive' } }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(cursor ? listCursorFilter(cursor, direction) : {}),
      },
      select: DOCUMENT_PUBLIC_SELECT,
      orderBy:
        direction === 'asc'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });

    const hasMore = documents.length > input.limit;
    const page = hasMore ? documents.slice(0, input.limit) : documents;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeListCursor(page[page.length - 1])
        : null;

    return {
      documents: page.map(toDocumentSummary),
      nextCursor,
    };
  }

  async rename(
    organizationId: string,
    documentId: string,
    input: UpdateDocumentInput,
    userId: string,
  ): Promise<DocumentDetailResponse> {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.document.findFirst({
        where: { id: documentId, organizationId },
        select: { title: true },
      });
      if (!previous) throw new NotFoundException('Document not found');
      const updated = await tx.document.updateMany({
        where: { id: documentId, organizationId },
        data: { title: input.title },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Document not found');
      }

      await this.activity.record(tx, {
        organizationId,
        actorId: userId,
        action: 'DOCUMENT_RENAMED',
        targetType: 'document',
        targetId: documentId,
        metadata: { from: previous.title, to: input.title },
      });
    });
    return this.readDocument(organizationId, documentId);
  }

  async delete(
    organizationId: string,
    documentId: string,
    userId: string,
  ): Promise<void> {
    const document = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, organizationId },
        select: {
          id: true,
          title: true,
          uploadStorageKey: true,
          storageKey: true,
        },
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      const deleted = await tx.document.deleteMany({
        where: { id: documentId, organizationId },
      });

      if (deleted.count === 0)
        throw new NotFoundException('Document not found');
      await this.activity.record(tx, {
        organizationId,
        actorId: userId,
        action: 'DOCUMENT_DELETED',
        targetType: 'document',
        targetId: documentId,
        metadata: { title: document.title },
      });
      return document;
    });

    await this.deleteObjectsBestEffort([
      document.uploadStorageKey,
      document.storageKey,
    ]);
  }

  async reprocess(
    organizationId: string,
    documentId: string,
    userId: string,
  ): Promise<DocumentDetailResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: {
        id: true,
        status: true,
        title: true,
        storageKey: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.status !== 'FAILED') {
      throw new ConflictException('Only failed documents can be reprocessed');
    }

    if (
      !document.storageKey ||
      !isDocumentVerifiedKey(document.storageKey, organizationId, documentId)
    ) {
      throw new ConflictException(
        'The uploaded file is no longer available. Delete this document and upload it again.',
      );
    }

    const verifiedKey = document.storageKey;
    const inspected = await this.runStorage(() =>
      this.storage.inspectObject(verifiedKey),
    );

    if (!inspected) {
      throw new ConflictException(
        'The uploaded file is no longer available. Delete this document and upload it again.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.updateMany({
        where: {
          id: documentId,
          organizationId,
          status: 'FAILED',
          storageKey: verifiedKey,
        },
        data: {
          status: 'PROCESSING',
          generation: { increment: 1 },
          failureReason: null,
          failureKind: null,
        },
      });

      if (updated.count === 0) {
        return false;
      }

      const transitioned = await tx.document.findFirstOrThrow({
        where: { id: documentId, organizationId },
        select: { generation: true, title: true },
      });

      await tx.documentProcessingJob.create({
        data: {
          documentId,
          organizationId,
          documentGeneration: transitioned.generation,
          verifiedStorageKey: verifiedKey,
          state: 'QUEUED',
          attempt: 0,
          maxAttempts: PROCESSING_MAX_ATTEMPTS,
        },
      });

      await this.activity.record(tx, {
        organizationId,
        actorId: userId,
        action: 'DOCUMENT_REPROCESSED',
        targetType: 'document',
        targetId: documentId,
        metadata: { title: document.title },
      });

      return true;
    });

    return this.readDocument(organizationId, documentId);
  }

  async getDetail(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    return this.readDocument(organizationId, documentId);
  }

  async createDownloadUrl(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDownloadUrlResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { storageKey: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const storageKey = document.storageKey;

    if (
      !storageKey ||
      !isDocumentVerifiedKey(storageKey, organizationId, documentId)
    ) {
      throw new ConflictException(
        'The original file is not available for this document',
      );
    }

    const inspected = await this.runStorage(() =>
      this.storage.inspectObject(storageKey),
    );

    if (!inspected) {
      throw new ConflictException(
        'The original file is no longer available. Delete this document and upload it again.',
      );
    }

    const download = await this.storage.createPresignedDownload({
      key: storageKey,
      expiresInSeconds: this.storageConfig.downloadTtlSeconds,
    });

    return {
      url: download.url,
      expiresAt: download.expiresAt.toISOString(),
    };
  }

  async createUploadUrl(
    context: OrganizationContext,
    documentId: string,
    input: CreateUploadUrlInput,
  ): Promise<DocumentUploadUrlResponse> {
    const organizationId = context.organizationId;
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true, status: true, uploadStorageKey: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (isProcessing(document.status)) {
      throw new ConflictException(
        'Upload URLs cannot be issued once processing has started',
      );
    }

    if (input.sizeBytes !== undefined && input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `sizeBytes must not exceed ${MAX_UPLOAD_BYTES}`,
      );
    }

    const key = createDocumentStorageKey(organizationId, documentId);

    const upload = await this.storage.createPresignedUpload({
      key,
      contentType: input.contentType,
      expiresInSeconds: this.storageConfig.uploadTtlSeconds,
    });

    const updated = await this.prisma.document.updateMany({
      where: {
        id: documentId,
        organizationId,
        status: { in: [...VERIFIABLE_STATUSES] },
      },
      data: { uploadStorageKey: key, expectedContentType: input.contentType },
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'Upload URLs cannot be issued once processing has started',
      );
    }

    await this.deleteSupersededStagingKey(document.uploadStorageKey, key);

    return {
      uploadUrl: upload.url,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxSizeBytes: MAX_UPLOAD_BYTES,
    };
  }

  async completeUpload(
    context: OrganizationContext,
    documentId: string,
    input: CompleteUploadInput,
  ): Promise<DocumentDetailResponse> {
    return this.finishUpload(context, documentId, input);
  }

  private async finishUpload(context: OrganizationContext, documentId: string, input: CompleteUploadInput): Promise<DocumentDetailResponse> {
    const organizationId = context.organizationId;
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: {
        id: true,
        status: true,
        uploadStorageKey: true,
        expectedContentType: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (isProcessing(document.status)) {
      return this.readDocument(organizationId, documentId);
    }

    const stagingKey = document.uploadStorageKey;
    const expectedContentType = document.expectedContentType;

    if (!stagingKey || !expectedContentType) {
      throw new ConflictException(
        'No upload is awaiting verification for this document',
      );
    }

    if (!isDocumentStagingKey(stagingKey, organizationId, documentId)) {
      throw new ServiceUnavailableException(
        'The document upload key is not valid for this document',
      );
    }

    const inspected = await this.runStorage(() =>
      this.storage.inspectObject(stagingKey),
    );

    if (!inspected) {
      throw new ConflictException(
        'The uploaded object was not found for this document',
      );
    }

    const metadataFailure = evaluateUploadMetadata(
      { sizeBytes: inspected.sizeBytes, contentType: inspected.contentType },
      expectedContentType,
    );

    if (metadataFailure) {
      return this.recordVerificationFailure(
        organizationId,
        documentId,
        stagingKey,
        metadataFailure,
      );
    }

    const prefix = await this.runStorage(() =>
      this.storage.readObjectPrefix({
        key: stagingKey,
        maxBytes: SIGNATURE_PREFIX_BYTES,
        version: inspected.version,
      }),
    );

    const signatureFailure = evaluateUploadSignature(
      expectedContentType,
      prefix,
    );

    if (signatureFailure) {
      return this.recordVerificationFailure(
        organizationId,
        documentId,
        stagingKey,
        signatureFailure,
      );
    }

    const isOfficeArchive = [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(expectedContentType);
    const archiveBytes = isOfficeArchive
      ? await this.runStorage(() =>
          this.storage.readObjectPrefix({
            key: stagingKey,
            maxBytes: inspected.sizeBytes,
            version: inspected.version,
          }),
        )
      : prefix;
    const archiveFailure = await evaluateOfficeArchive(
      expectedContentType,
      archiveBytes,
    );
    if (archiveFailure) {
      return this.recordVerificationFailure(
        organizationId,
        documentId,
        stagingKey,
        archiveFailure,
      );
    }

    const verifiedKey = createVerifiedStorageKey(organizationId, documentId);

    await this.runStorage(() =>
      this.storage.copyObject({
        sourceKey: stagingKey,
        destinationKey: verifiedKey,
        version: inspected.version,
        contentType: expectedContentType,
      }),
    );

    const promoted = await this.runStorage(() =>
      this.storage.inspectObject(verifiedKey),
    );

    if (
      !promoted ||
      promoted.sizeBytes !== inspected.sizeBytes ||
      promoted.contentType !== expectedContentType ||
      normalizeObjectVersion(promoted.version) !==
        normalizeObjectVersion(inspected.version)
    ) {
      throw new ServiceUnavailableException(
        'The promoted object did not pass its integrity check',
      );
    }

    const enqueued = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.updateMany({
        where: {
          id: documentId,
          organizationId,
          uploadStorageKey: stagingKey,
          status: { in: [...VERIFIABLE_STATUSES] },
        },
        data: {
          storageKey: verifiedKey,
          status: 'PROCESSING',
          generation: { increment: 1 },
          contentType: promoted.contentType,
          sizeBytes: promoted.sizeBytes,
          failureReason: null,
          failureKind: null,
          ...(input.originalFileName !== undefined
            ? { originalFileName: input.originalFileName }
            : {}),
        },
      });

      if (updated.count === 0) {
        return false;
      }

      const transitioned = await tx.document.findFirstOrThrow({
        where: { id: documentId, organizationId },
        select: { generation: true, title: true },
      });

      await tx.documentProcessingJob.create({
        data: {
          documentId,
          organizationId,
          documentGeneration: transitioned.generation,
          verifiedStorageKey: verifiedKey,
          state: 'QUEUED',
          attempt: 0,
          maxAttempts: PROCESSING_MAX_ATTEMPTS,
        },
      });

      await this.activity.record(tx, {
        organizationId,
        actorId: context.userId,
        action: 'DOCUMENT_UPLOADED',
        targetType: 'document',
        targetId: documentId,
        metadata: { title: transitioned.title },
      });

      return true;
    });

    if (!enqueued) {
      return this.resolveSupersededCompletion(organizationId, documentId);
    }

    await this.deleteSupersededStagingKey(stagingKey, null);

    return this.readDocument(organizationId, documentId);
  }

  private async recordVerificationFailure(
    organizationId: string,
    documentId: string,
    stagingKey: string,
    reason: UploadFailureReason,
  ): Promise<DocumentDetailResponse> {
    const updated = await this.prisma.document.updateMany({
      where: {
        id: documentId,
        organizationId,
        uploadStorageKey: stagingKey,
        status: { in: [...VERIFIABLE_STATUSES] },
      },
      data: {
        status: 'FAILED',
        failureReason: reason,
        failureKind: 'VERIFICATION',
      },
    });

    if (updated.count === 0) {
      return this.resolveSupersededCompletion(organizationId, documentId);
    }

    return this.readDocument(organizationId, documentId);
  }

  private async resolveSupersededCompletion(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    const current = await this.readDocument(organizationId, documentId);

    if (isProcessing(current.document.status)) {
      return current;
    }

    throw new ConflictException(
      'The upload was superseded by a newer upload before it could be verified',
    );
  }

  private async readDocument(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: DOCUMENT_PUBLIC_SELECT,
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return { document: toDocumentSummary(document) };
  }

  private async deleteSupersededStagingKey(
    previousKey: string | null,
    currentKey: string | null,
  ): Promise<void> {
    if (!previousKey || previousKey === currentKey) {
      return;
    }
    await this.deleteObjectsBestEffort([previousKey]);
  }

  private async deleteObjectsBestEffort(
    keys: (string | null)[],
  ): Promise<void> {
    const targets = keys.filter((key): key is string => key !== null);

    await Promise.all(
      targets.map(async (key) => {
        try {
          await this.storage.deleteObject(key);
        } catch (error) {
          this.logger.warn(
            `Could not delete object ${key}; leaving it for garbage collection`,
            error,
          );
        }
      }),
    );
  }

  private async runStorage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ObjectVersionMismatchError) {
        throw new ConflictException(
          'The uploaded object changed during verification',
        );
      }
      throw new ServiceUnavailableException(
        'Object storage is temporarily unavailable',
      );
    }
  }
}

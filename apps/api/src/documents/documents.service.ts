import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  DocumentDetailResponse,
  DocumentFailureKind,
  DocumentListResponse,
  DocumentStatus,
  DocumentSummary,
  DocumentUploadUrlResponse,
} from '@knowledgehub/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
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
import { PROCESSING_MAX_ATTEMPTS } from './processing-policy.js';
import {
  createDocumentStorageKey,
  createVerifiedStorageKey,
  isDocumentStagingKey,
} from './upload-key.js';
import {
  MAX_UPLOAD_BYTES,
  SIGNATURE_PREFIX_BYTES,
  type UploadFailureReason,
} from './upload-policy.js';
import {
  evaluateUploadMetadata,
  evaluateUploadSignature,
} from './verification-policy.js';

const DOCUMENT_PUBLIC_SELECT = {
  id: true,
  title: true,
  status: true,
  originalFileName: true,
  contentType: true,
  sizeBytes: true,
  failureReason: true,
  failureKind: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VERIFIABLE_STATUSES = ['PENDING', 'FAILED'] as const;

interface DocumentProjection {
  id: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  failureKind: DocumentFailureKind | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDocumentSummary(document: DocumentProjection): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
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
  ) {}

  async create(
    context: OrganizationContext,
    input: CreateDocumentInput,
  ): Promise<DocumentDetailResponse> {
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

  async list(
    organizationId: string,
    input: ListDocumentsInput,
  ): Promise<DocumentListResponse> {
    const cursor = input.cursor ? decodeListCursor(input.cursor) : null;
    if (input.cursor && !cursor) {
      throw new BadRequestException('cursor is not valid');
    }

    const direction = input.order === 'createdAt_asc' ? 'asc' : 'desc';
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        ...(input.q ? { title: { contains: input.q, mode: 'insensitive' } } : {}),
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
  ): Promise<DocumentDetailResponse> {
    const updated = await this.prisma.document.updateMany({
      where: { id: documentId, organizationId },
      data: { title: input.title },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Document not found');
    }

    return this.readDocument(organizationId, documentId);
  }

  async delete(organizationId: string, documentId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true, uploadStorageKey: true, storageKey: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.prisma.document.deleteMany({
      where: { id: documentId, organizationId },
    });

    await this.deleteObjectsBestEffort([
      document.uploadStorageKey,
      document.storageKey,
    ]);
  }

  async getDetail(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    return this.readDocument(organizationId, documentId);
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
        select: { generation: true },
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

  private async deleteObjectsBestEffort(keys: (string | null)[]): Promise<void> {
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

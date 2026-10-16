import {
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type {
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentStatus,
  DocumentSummary,
  DocumentUploadUrlResponse,
} from '@knowledgehub/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../storage/object-storage.port.js';
import { StorageConfig } from '../storage/storage.config.js';
import type { CreateDocumentInput } from './dto/create-document.schema.js';
import type { CreateUploadUrlInput } from './dto/create-upload-url.schema.js';
import { createDocumentStorageKey } from './upload-key.js';
import { MAX_UPLOAD_BYTES } from './upload-policy.js';

const DOCUMENT_PUBLIC_SELECT = {
  id: true,
  title: true,
  status: true,
  originalFileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface DocumentProjection {
  id: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
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
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

@Injectable()
export class DocumentsService {
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

  async list(organizationId: string): Promise<DocumentListResponse> {
    const documents = await this.prisma.document.findMany({
      where: { organizationId },
      select: DOCUMENT_PUBLIC_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return { documents: documents.map(toDocumentSummary) };
  }

  async getDetail(
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

  async createUploadUrl(
    context: OrganizationContext,
    documentId: string,
    input: CreateUploadUrlInput,
  ): Promise<DocumentUploadUrlResponse> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId: context.organizationId },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (input.sizeBytes !== undefined && input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `sizeBytes must not exceed ${MAX_UPLOAD_BYTES}`,
      );
    }

    const key = createDocumentStorageKey(context.organizationId, documentId);

    const upload = await this.storage.createPresignedUpload({
      key,
      contentType: input.contentType,
      expiresInSeconds: this.storageConfig.uploadTtlSeconds,
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: { storageKey: key },
    });

    return {
      uploadUrl: upload.url,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxSizeBytes: MAX_UPLOAD_BYTES,
    };
  }
}

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SummariesService } from '../summaries/summaries.service.js';
import { FactsService } from '../facts/facts.service.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../storage/object-storage.port.js';
import {
  DocumentResourceLimitError,
  DocumentTextExtractor,
} from './document-text-extractor.js';
import { DocumentChunkStore } from './document-chunk.store.js';
import { chunkPages } from './chunking.policy.js';
import { hasMeaningfulPdfText } from './meaningful-pdf-text.policy.js';
import { ProcessingConfig } from './processing.config.js';
import {
  classifyProcessingFailure,
  ProcessingFailureError,
} from './processing-failure.js';
import { OCR_PROVIDER, type OcrProvider } from './ocr-provider.port.js';
import {
  PDF_PAGE_RENDERER,
  type PdfPageRenderer,
} from './pdf-page-renderer.port.js';
import {
  MAX_EXTRACTABLE_BYTES,
  MAX_EXTRACTED_CHARACTERS,
} from './processing-limits.policy.js';
import {
  ProcessingJobService,
  type ClaimedProcessingJob,
  type ExtractionResult,
  type ProcessingOwnership,
} from './processing-job.service.js';

interface LeaseGuard {
  readonly lost: boolean;
  stop(): void;
}

function ownershipOf(job: ClaimedProcessingJob): ProcessingOwnership {
  return {
    jobId: job.id,
    leaseId: job.leaseId,
    organizationId: job.organizationId,
    documentGeneration: job.documentGeneration,
    verifiedStorageKey: job.verifiedStorageKey,
  };
}

@Injectable()
export class ProcessingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingWorkerService.name);
  private readonly workerId = `worker-${randomUUID()}`;
  private running = false;
  private currentRun: Promise<void> | null = null;
  private wakeTimer: NodeJS.Timeout | null = null;
  private wake: (() => void) | null = null;
  private lastRecoveryAt = 0;

  constructor(
    private readonly jobs: ProcessingJobService,
    private readonly extractor: DocumentTextExtractor,
    private readonly chunks: DocumentChunkStore,
    private readonly config: ProcessingConfig,
    private readonly facts: FactsService,
    private readonly summaries: SummariesService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(PDF_PAGE_RENDERER) private readonly renderer: PdfPageRenderer,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  onModuleInit(): void {
    if (!this.config.workerEnabled) {
      return;
    }

    this.running = true;
    this.currentRun = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }

    this.wake?.();
    this.wake = null;

    await this.currentRun;
  }

  async runOnce(): Promise<boolean> {
    const now = Date.now();

    if (now - this.lastRecoveryAt >= this.config.recoveryIntervalMs) {
      this.lastRecoveryAt = now;
      await this.jobs.recoverExpiredLeases();
    }

    const job = await this.jobs.claimNextDueJob(this.workerId);
    if (!job) {
      return false;
    }

    await this.processJob(job);
    return true;
  }

  async processJob(job: ClaimedProcessingJob): Promise<void> {
    const lease = this.startLeaseRenewal(job);

    try {
      const extracted = await this.extract(job, lease);
      if (!extracted || lease.lost) {
        return;
      }

      if (
        job.contentType === 'application/pdf' &&
        !hasMeaningfulPdfText(extracted.pages)
      ) {
        throw new ProcessingFailureError(
          'NO_EXTRACTABLE_TEXT',
          `Processing job ${job.id} produced no extractable text`,
        );
      }

      const ownership = ownershipOf(job);
      const drafts = chunkPages(extracted.pages);
      if (drafts.length === 0) {
        throw new ProcessingFailureError(
          'NO_EXTRACTABLE_TEXT',
          `Processing job ${job.id} produced no extractable text`,
        );
      }

      const stored = await this.chunks.replaceForGeneration(ownership, drafts);
      if (!stored || lease.lost) {
        return;
      }

      if (this.facts.enabled) {
        await this.facts.extractForDocument(
          {
            organizationId: job.organizationId,
            documentId: job.documentId,
            documentGeneration: job.documentGeneration,
          },
          extracted.pages,
          drafts,
        );

        if (lease.lost) {
          return;
        }
      }

      const published = await this.jobs.publishExtraction(ownership, extracted);
      if (published) {
        void this.summaries
          .summarize(
            {
              organizationId: job.organizationId,
              documentId: job.documentId,
              documentGeneration: job.documentGeneration,
            },
            drafts,
          )
          .catch((error: unknown) =>
            this.logger.warn('Summary trigger failed', error),
          );
      }
    } catch (error) {
      await this.recordFailure(job, error);
    } finally {
      lease.stop();
    }
  }

  private async recordFailure(
    job: ClaimedProcessingJob,
    error: unknown,
  ): Promise<void> {
    const failure = classifyProcessingFailure(error);

    try {
      await this.jobs.recordFailure(ownershipOf(job), failure);
    } catch (recordError) {
      this.logger.error(
        `Could not record the failure of processing job ${job.id}; recovery will retry it`,
        recordError,
      );
      return;
    }

    if (failure.category === 'permanent') {
      this.logger.warn(
        `Processing job ${job.id} failed permanently (${failure.reason})`,
      );
      return;
    }

    this.logger.warn(`Processing job ${job.id} failed and will be retried`);
  }

  private async extract(
    job: ClaimedProcessingJob,
    lease: LeaseGuard,
  ): Promise<ExtractionResult | null> {
    if (!job.contentType) {
      throw new ProcessingFailureError(
        'CONTENT_UNSUPPORTED',
        `Processing job ${job.id} has no verified content type`,
      );
    }

    const metadata = await this.storage.inspectObject(job.verifiedStorageKey);
    if (!metadata) {
      throw new ProcessingFailureError(
        'VERIFIED_OBJECT_MISSING',
        `Verified object for job ${job.id} was not found`,
      );
    }

    if (metadata.sizeBytes > MAX_EXTRACTABLE_BYTES) {
      throw new DocumentResourceLimitError(
        'The document exceeds the extraction size limit',
      );
    }

    const bytes = await this.storage.readObject({
      key: job.verifiedStorageKey,
      version: metadata.version,
    });

    if (lease.lost) {
      return null;
    }

    const extracted = await this.extractor.extract({
      contentType: job.contentType,
      bytes,
    });
    if (
      job.contentType !== 'application/pdf' ||
      hasMeaningfulPdfText(extracted.pages) ||
      !this.config.ocrEnabled
    )
      return extracted;
    const images = await this.renderer.render(
      Buffer.from(bytes),
      this.config.ocrMaxPages,
    );
    if (lease.lost) return null;
    const recognized = await this.ocr.recognize(images);
    if (lease.lost) return null;
    const pages = recognized.map(({ pageNumber, text }) => ({
      pageNumber,
      content: text,
    }));
    const characterCount = pages.reduce(
      (sum, page) => sum + page.content.length,
      0,
    );
    if (characterCount > MAX_EXTRACTED_CHARACTERS)
      throw new DocumentResourceLimitError(
        'The document exceeds the extraction character limit',
      );
    return { ...extracted, pages, characterCount };
  }

  private startLeaseRenewal(job: ClaimedProcessingJob): LeaseGuard {
    let lost = false;

    const timer = setInterval(() => {
      void this.jobs
        .renewLease({ jobId: job.id, leaseId: job.leaseId })
        .then((renewed) => {
          lost = !renewed;
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Could not renew the lease for job ${job.id}`,
            error,
          );
        });
    }, this.config.renewalIntervalMs);

    timer.unref();

    return {
      get lost(): boolean {
        return lost;
      },
      stop: () => clearInterval(timer),
    };
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.runOnce();
        if (!this.running) {
          return;
        }
        if (!processed) {
          await this.waitForNextPoll();
        }
      } catch (error) {
        this.logger.error('Processing worker iteration failed', error);
        if (this.running) {
          await this.waitForNextPoll();
        }
      }
    }
  }

  private waitForNextPoll(): Promise<void> {
    return new Promise((resolve) => {
      this.wake = resolve;
      this.wakeTimer = setTimeout(() => {
        this.wake = null;
        this.wakeTimer = null;
        resolve();
      }, this.config.pollIntervalMs);
      this.wakeTimer.unref();
    });
  }
}

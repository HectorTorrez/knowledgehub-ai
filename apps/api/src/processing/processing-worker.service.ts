import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../storage/object-storage.port.js';
import {
  DocumentResourceLimitError,
  DocumentTextExtractor,
} from './document-text-extractor.js';
import { ProcessingConfig } from './processing.config.js';
import {
  classifyProcessingFailure,
  ProcessingFailureError,
} from './processing-failure.js';
import { MAX_EXTRACTABLE_BYTES } from './processing-limits.policy.js';
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
    private readonly config: ProcessingConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
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

      await this.jobs.publishExtraction(ownershipOf(job), extracted);
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

    return this.extractor.extract({ contentType: job.contentType, bytes });
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
          this.logger.warn(`Could not renew the lease for job ${job.id}`, error);
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

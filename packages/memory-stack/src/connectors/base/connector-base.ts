/**
 * Connector Base Class
 * ====================
 * Abstract base for all connectors (GitHub, Slack, Jira, Freshworks).
 * Provides:
 * - Rate limiting
 * - Checkpointing (resume capability)
 * - Stream processing (batch inserts)
 * - Error handling
 * - Progress tracking
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RateLimiter, RateLimitConfig } from './rate-limiter.js';
import { CheckpointManager, Checkpoint } from './checkpoint-manager.js';
import { StreamProcessor, Signal } from './stream-processor.js';

export interface IngestionResult {
  success: boolean;
  signalsIngested: number;
  errors?: string[];
  duration?: number;
  checkpoint?: Checkpoint;
}

export interface IngestionOptions {
  mode: 'initial' | 'incremental';
  resumeFromCheckpoint?: boolean;
  batchSize?: number;
}

export abstract class ConnectorBase {
  abstract readonly connectorType: string;

  protected rateLimiter: RateLimiter;
  protected checkpointManager: CheckpointManager;
  protected streamProcessor: StreamProcessor;

  constructor(
    protected organizationId: string,
    protected credentials: any,
    protected supabase: SupabaseClient,
    protected redis?: any
  ) {
    this.rateLimiter = new RateLimiter(this.getRateLimits());
    this.checkpointManager = new CheckpointManager(supabase, redis);
    this.streamProcessor = new StreamProcessor(supabase, redis, 1000);
  }

  /**
   * Main ingestion entry point
   */
  async ingest(options: IngestionOptions): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      // Check for existing checkpoint
      const existingCheckpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );

      // Resume or start fresh?
      const shouldResume =
        options.resumeFromCheckpoint &&
        existingCheckpoint &&
        existingCheckpoint.status === 'in_progress';

      let result: IngestionResult;

      if (shouldResume) {
        console.log(`[${this.connectorType}] Resuming from checkpoint`, existingCheckpoint.state);
        result = await this.resumeIngestion(existingCheckpoint);
      } else {
        // Delete old checkpoint if starting fresh
        if (existingCheckpoint) {
          await this.checkpointManager.deleteCheckpoint(
            this.organizationId,
            this.connectorType
          );
        }

        // Start new ingestion
        result =
          options.mode === 'initial'
            ? await this.initialLoad()
            : await this.incrementalSync();
      }

      // Flush any remaining signals
      await this.streamProcessor.flush();

      // Mark as completed
      await this.checkpointManager.markCompleted(
        this.organizationId,
        this.connectorType,
        result.signalsIngested
      );

      const duration = Date.now() - startTime;
      return {
        ...result,
        duration,
      };
    } catch (error: any) {
      // Mark as failed
      await this.checkpointManager.markFailed(
        this.organizationId,
        this.connectorType,
        error.message
      );

      console.error(`[${this.connectorType}] Ingestion failed:`, error);

      return {
        success: false,
        signalsIngested: 0,
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Initial load: fetch all historical data
   */
  protected abstract initialLoad(): Promise<IngestionResult>;

  /**
   * Incremental sync: fetch only new/changed data since last sync
   */
  protected abstract incrementalSync(): Promise<IngestionResult>;

  /**
   * Resume from checkpoint
   */
  protected abstract resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult>;

  /**
   * Rate limits for this connector
   */
  protected abstract getRateLimits(): RateLimitConfig;

  /**
   * Transform raw data to NexusBrain signal
   */
  protected abstract transformToSignal(rawData: any): Signal;

  /**
   * Batch insert signals with deduplication
   */
  protected async batchInsertSignals(signals: Signal[]): Promise<void> {
    await this.streamProcessor.processBatch(
      signals,
      this.organizationId,
      this.connectorType
    );
  }

  /**
   * Save checkpoint for resume capability
   */
  protected async saveCheckpoint(state: Record<string, any>, progressPct = 0): Promise<void> {
    const stats = this.streamProcessor.getStats();

    await this.checkpointManager.saveCheckpoint({
      organization_id: this.organizationId,
      connector_type: this.connectorType,
      status: 'in_progress',
      progress_pct: progressPct,
      signals_ingested: stats.inserted,
      state,
    });
  }

  /**
   * Get ingestion progress
   */
  async getProgress(): Promise<Checkpoint | null> {
    return this.checkpointManager.getCheckpoint(this.organizationId, this.connectorType);
  }

  /**
   * Cancel ongoing ingestion
   */
  async cancel(): Promise<void> {
    await this.streamProcessor.flush();
    await this.checkpointManager.markFailed(
      this.organizationId,
      this.connectorType,
      'Cancelled by user'
    );
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.streamProcessor.getStats();
  }
}

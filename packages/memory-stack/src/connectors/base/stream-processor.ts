/**
 * Stream Processor
 * ================
 * Handles batch insertion of signals with deduplication.
 * Optimized for 10M+ scale ingestion.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface Signal {
  organization_id: string;
  source_domain: string;      // 'engineering', 'product', 'revenue', 'support'
  signal_type: string;         // 'pr_merged', 'pr_opened', 'pr_reviewed', etc.
  signal_value: number;        // Numeric value (cycle_time_hours, 1 for events)
  entity_type: string;         // 'pull_request', 'review', 'commit', 'issue'
  entity_id: string;           // 'backend#1234', 'review:5678'
  signal_metadata: Record<string, any>;  // Additional context
  created_at: string;          // DB insertion timestamp (defaults to NOW() in DB)
  signal_timestamp: string;    // When the event ACTUALLY occurred (for historical accuracy)
  content_hash?: string;       // For deduplication
}

export interface ProcessingStats {
  totalProcessed: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

export class StreamProcessor {
  private batch: Signal[] = [];
  private readonly batchSize: number;
  private stats: ProcessingStats = {
    totalProcessed: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
  };

  constructor(
    private supabase: SupabaseClient,
    private redis?: any,
    batchSize = 1000
  ) {
    this.batchSize = batchSize;
  }

  /**
   * Add signal to batch, auto-flush when full
   */
  async addSignal(signal: Signal): Promise<void> {
    this.batch.push(signal);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Add multiple signals at once
   */
  async addSignals(signals: Signal[]): Promise<void> {
    for (const signal of signals) {
      await this.addSignal(signal);
    }
  }

  /**
   * Process a batch immediately (don't wait for batch size)
   */
  async processBatch(
    signals: Signal[],
    organizationId: string,
    connectorType: string
  ): Promise<void> {
    if (signals.length === 0) return;

    // Deduplicate using signal hashes
    const deduped = await this.deduplicateSignals(signals, organizationId, connectorType);

    if (deduped.length === 0) {
      this.stats.duplicates += signals.length;
      return;
    }

    // Batch insert to database (Brain L1 ingestion table)
    const { error } = await this.supabase.from('cross_domain_signals').insert(deduped);

    if (error) {
      console.error('Batch insert failed:', error);
      this.stats.errors += deduped.length;
      throw error;
    }

    this.stats.inserted += deduped.length;
    this.stats.duplicates += signals.length - deduped.length;
    this.stats.totalProcessed += signals.length;

    // Update connector stats
    await this.updateConnectorStats(organizationId, connectorType, deduped.length);
  }

  /**
   * Flush current batch
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const batchToProcess = [...this.batch];
    this.batch = [];

    // Group by organization for efficient processing
    const byOrg = this.groupByOrganization(batchToProcess);

    for (const [orgId, signals] of Object.entries(byOrg)) {
      const connectorType = signals[0]?.source_domain || 'unknown';
      await this.processBatch(signals, orgId, connectorType);
    }
  }

  /**
   * Deduplicate signals using content hash
   */
  private async deduplicateSignals(
    signals: Signal[],
    organizationId: string,
    connectorType: string
  ): Promise<Signal[]> {
    // Generate hashes for each signal
    const signalsWithHashes = signals.map((signal) => ({
      signal,
      hash: this.generateSignalHash(signal),
    }));

    // Check Redis for duplicates (if available)
    if (this.redis) {
      const dedupKey = `dedup:${organizationId}:${connectorType}`;
      const hashes = signalsWithHashes.map((s) => s.hash);

      // Check which hashes already exist
      const existingHashes = await this.redis.smembers(dedupKey);
      const existingSet = new Set(existingHashes);

      // Filter out duplicates
      const newSignals = signalsWithHashes
        .filter((s) => !existingSet.has(s.hash))
        .map((s) => s.signal);

      // Add new hashes to Redis
      if (newSignals.length > 0) {
        const newHashes = signalsWithHashes
          .filter((s) => !existingSet.has(s.hash))
          .map((s) => s.hash);

        await this.redis.sadd(dedupKey, ...newHashes);

        // Set expiry (30 days)
        await this.redis.expire(dedupKey, 30 * 24 * 60 * 60);
      }

      return newSignals;
    }

    // Fallback: Check database (slower)
    const hashes = signalsWithHashes.map((s) => s.hash);
    const { data: existing } = await this.supabase
      .from('cross_domain_signals')
      .select('content_hash')
      .in('content_hash', hashes)
      .eq('organization_id', organizationId);

    const existingHashes = new Set(existing?.map((r) => r.content_hash) || []);

    return signalsWithHashes
      .filter((s) => !existingHashes.has(s.hash))
      .map((s) => ({
        ...s.signal,
        content_hash: s.hash,
      }));
  }

  /**
   * Generate deterministic hash for a signal
   */
  private generateSignalHash(signal: Signal): string {
    const key = `${signal.source_domain}:${signal.signal_type}:${signal.entity_id}:${signal.signal_timestamp}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Group signals by organization
   */
  private groupByOrganization(signals: Signal[]): Record<string, Signal[]> {
    return signals.reduce((acc, signal) => {
      const orgId = signal.organization_id;
      if (!acc[orgId]) {
        acc[orgId] = [];
      }
      acc[orgId].push(signal);
      return acc;
    }, {} as Record<string, Signal[]>);
  }

  /**
   * Update connector statistics
   */
  private async updateConnectorStats(
    organizationId: string,
    connectorType: string,
    signalsAdded: number
  ): Promise<void> {
    // Increment signals_count
    const { error: rpcError } = await this.supabase.rpc('increment_connector_signals', {
      p_organization_id: organizationId,
      p_connector_type: connectorType,
      p_increment: signalsAdded,
    });

    if (rpcError) {
      // Fallback if RPC doesn't exist — just update last_sync_at
      await this.supabase
        .from('org_connectors')
        .update({
          last_sync_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('connector_type', connectorType);
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      inserted: 0,
      duplicates: 0,
      errors: 0,
    };
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batch.length;
  }
}

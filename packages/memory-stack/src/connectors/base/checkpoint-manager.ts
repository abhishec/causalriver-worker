/**
 * Checkpoint Manager
 * ==================
 * Enables resume capability for 10M+ scale ingestion.
 * Saves progress to database (and optionally Redis) so jobs can resume after failures.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface Checkpoint {
  // Common fields
  connector_type: string;
  organization_id: string;
  status: 'in_progress' | 'completed' | 'failed';
  progress_pct: number;
  signals_ingested: number;
  started_at: string;
  updated_at: string;

  // Connector-specific state (varies by connector)
  state: {
    // GitHub
    lastRepo?: string;
    lastCommitSha?: string;
    lastFilePath?: string;
    filesProcessed?: number;

    // Slack
    lastChannel?: string;
    lastMessageTs?: string;
    messagesProcessed?: number;

    // Jira
    lastIssueKey?: string;
    issuesProcessed?: number;

    // Freshworks
    lastTicketId?: number;
    ticketsProcessed?: number;

    // Generic
    lastCursor?: string;
    lastPage?: number;
    [key: string]: any;
  };
}

export class CheckpointManager {
  constructor(
    private supabase: SupabaseClient,
    private redis?: any // Optional Redis for faster lookups
  ) {}

  /**
   * Get latest checkpoint for an organization + connector
   */
  async getCheckpoint(
    organizationId: string,
    connectorType: string
  ): Promise<Checkpoint | null> {
    // Try Redis first (if available)
    if (this.redis) {
      const cacheKey = `checkpoint:${organizationId}:${connectorType}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Fallback to database
    const { data, error } = await this.supabase
      .from('connector_checkpoints')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('connector_type', connectorType)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Cache in Redis
    if (this.redis) {
      const cacheKey = `checkpoint:${organizationId}:${connectorType}`;
      await this.redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min TTL
    }

    return data as Checkpoint;
  }

  /**
   * Save checkpoint (upsert)
   */
  async saveCheckpoint(checkpoint: Partial<Checkpoint>): Promise<void> {
    const now = new Date().toISOString();

    const checkpointData = {
      ...checkpoint,
      updated_at: now,
      started_at: checkpoint.started_at || now,
    };

    // Save to database
    const { error } = await this.supabase
      .from('connector_checkpoints')
      .upsert(checkpointData, {
        onConflict: 'organization_id,connector_type',
      });

    if (error) {
      console.error('Failed to save checkpoint:', error);
      throw error;
    }

    // Update Redis cache
    if (this.redis) {
      const cacheKey = `checkpoint:${checkpoint.organization_id}:${checkpoint.connector_type}`;
      await this.redis.setex(cacheKey, 300, JSON.stringify(checkpointData));
    }
  }

  /**
   * Mark checkpoint as completed
   */
  async markCompleted(
    organizationId: string,
    connectorType: string,
    signalsIngested: number
  ): Promise<void> {
    await this.saveCheckpoint({
      organization_id: organizationId,
      connector_type: connectorType,
      status: 'completed',
      progress_pct: 100,
      signals_ingested: signalsIngested,
    });
  }

  /**
   * Mark checkpoint as failed
   */
  async markFailed(
    organizationId: string,
    connectorType: string,
    errorMessage: string
  ): Promise<void> {
    await this.saveCheckpoint({
      organization_id: organizationId,
      connector_type: connectorType,
      status: 'failed',
      state: {
        error: errorMessage,
      },
    });
  }

  /**
   * Delete checkpoint (start fresh)
   */
  async deleteCheckpoint(organizationId: string, connectorType: string): Promise<void> {
    await this.supabase
      .from('connector_checkpoints')
      .delete()
      .eq('organization_id', organizationId)
      .eq('connector_type', connectorType);

    // Clear Redis cache
    if (this.redis) {
      const cacheKey = `checkpoint:${organizationId}:${connectorType}`;
      await this.redis.del(cacheKey);
    }
  }

  /**
   * Get all active checkpoints (for monitoring)
   */
  async getActiveCheckpoints(): Promise<Checkpoint[]> {
    const { data, error } = await this.supabase
      .from('connector_checkpoints')
      .select('*')
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data as Checkpoint[];
  }

  /**
   * Calculate ETA based on progress
   */
  calculateETA(checkpoint: Checkpoint): number | null {
    if (checkpoint.progress_pct === 0) return null;

    const elapsed = Date.now() - new Date(checkpoint.started_at).getTime();
    const totalEstimated = (elapsed / checkpoint.progress_pct) * 100;
    const remaining = totalEstimated - elapsed;

    return Math.max(0, remaining / 1000); // seconds
  }
}

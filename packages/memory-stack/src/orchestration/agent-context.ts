/**
 * Nexus Memory Stack - Agent Context
 *
 * L6: Domain Agent Orchestration Layer
 * Provides org-scoped agent execution context and lifecycle management.
 *
 * Features:
 * - Run initialization and tracking
 * - Progress updates and metrics
 * - Graceful completion with statistics
 * - Job queue management
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for an agent run
 */
export interface AgentContext {
  agentId: string;
  agentType: string;
  organizationId: string;
  runId: string;
  startedAt: Date;
  config: Record<string, unknown>;
}

/**
 * Result of an agent run
 */
export interface AgentRunResult {
  success: boolean;
  metrics?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
}

/**
 * Run type categorization
 */
export type AgentRunType = 'scheduled' | 'manual' | 'triggered' | 'retry';

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';

// ============================================================================
// AGENT CONTEXT MANAGER
// ============================================================================

/**
 * Create an agent context manager
 *
 * @example
 * ```typescript
 * const agentManager = createAgentContextManager({
 *   registryTable: 'agent_registry',
 *   runsTable: 'agent_runs',
 *   queueTable: 'agent_queue',
 * });
 *
 * const context = await agentManager.initializeRun(
 *   supabase,
 *   'signal_discovery',
 *   organizationId,
 *   'scheduled'
 * );
 *
 * // ... agent work ...
 *
 * await agentManager.completeRun(supabase, context, { success: true });
 * ```
 */
export function createAgentContextManager(options: {
  registryTable?: string;
  runsTable?: string;
  queueTable?: string;
} = {}) {
  const {
    registryTable = 'agent_registry',
    runsTable = 'agent_runs',
    queueTable = 'agent_queue',
  } = options;

  return {
    /**
     * Initialize an agent run with context
     */
    initializeRun: async (
      supabase: SupabaseClient,
      agentType: string,
      organizationId: string,
      runType: AgentRunType = 'manual',
      triggeredBy?: string,
      inputContext?: Record<string, unknown>
    ): Promise<AgentContext | null> => {
      try {
        // Get agent from registry
        const { data: agent, error: agentError } = await supabase
          .from(registryTable)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('agent_type', agentType)
          .single();

        if (agentError || !agent) {
          console.error(`[Agent] Agent ${agentType} not found for org ${organizationId}`);
          return null;
        }

        if (!agent.is_enabled) {
          console.log(`[Agent] Agent ${agentType} is disabled for org ${organizationId}`);
          return null;
        }

        // Create run record
        const { data: run, error: runError } = await supabase
          .from(runsTable)
          .insert({
            organization_id: organizationId,
            agent_id: agent.id,
            run_type: runType,
            triggered_by: triggeredBy || null,
            status: 'running',
            started_at: new Date().toISOString(),
            progress_pct: 0,
            input_context: inputContext || null,
          })
          .select()
          .single();

        if (runError) {
          console.error(`[Agent] Failed to create run record:`, runError);
          return null;
        }

        // Update agent status
        await supabase
          .from(registryTable)
          .update({ status: 'running', last_run_at: new Date().toISOString() })
          .eq('id', agent.id);

        console.log(`[Agent] Initialized ${agentType} run ${run.id} for org ${organizationId}`);

        return {
          agentId: agent.id as string,
          agentType,
          organizationId,
          runId: run.id as string,
          startedAt: new Date(),
          config: (agent.config || {}) as Record<string, unknown>,
        };
      } catch (error) {
        console.error(`[Agent] Error initializing agent run:`, error);
        return null;
      }
    },

    /**
     * Update run progress
     */
    updateProgress: async (
      supabase: SupabaseClient,
      runId: string,
      progressPct: number,
      currentStep?: string,
      totalSteps?: number
    ): Promise<void> => {
      try {
        await supabase
          .from(runsTable)
          .update({
            progress_pct: progressPct,
            current_step: currentStep || null,
            total_steps: totalSteps || null,
          })
          .eq('id', runId);
      } catch (error) {
        console.error(`[Agent] Error updating progress:`, error);
      }
    },

    /**
     * Complete agent run with results
     */
    completeRun: async (
      supabase: SupabaseClient,
      context: AgentContext,
      result: AgentRunResult
    ): Promise<void> => {
      try {
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - context.startedAt.getTime();

        // Update run record
        await supabase
          .from(runsTable)
          .update({
            status: result.success ? 'completed' : 'failed',
            completed_at: completedAt.toISOString(),
            duration_ms: durationMs,
            progress_pct: result.success ? 100 : undefined,
            result: result.metrics || null,
            metrics: result.metrics || null,
            output_summary: result.outputSummary || null,
            error_message: result.errorMessage || null,
            error_stack: result.errorStack || null,
          })
          .eq('id', context.runId);

        // Update agent registry stats
        const { data: agent } = await supabase
          .from(registryTable)
          .select('total_runs, successful_runs, failed_runs, avg_duration_ms')
          .eq('id', context.agentId)
          .single();

        if (agent) {
          const totalRuns = (agent.total_runs as number) || 0;
          const successfulRuns = (agent.successful_runs as number) || 0;
          const failedRuns = (agent.failed_runs as number) || 0;
          const avgDurationMs = (agent.avg_duration_ms as number) || 0;

          const newTotalRuns = totalRuns + 1;
          const newSuccessful = result.success ? successfulRuns + 1 : successfulRuns;
          const newFailed = result.success ? failedRuns : failedRuns + 1;

          // Calculate new average duration
          const prevTotal = avgDurationMs ? avgDurationMs * totalRuns : 0;
          const newAvgDuration = Math.round((prevTotal + durationMs) / newTotalRuns);

          await supabase
            .from(registryTable)
            .update({
              status: result.success ? 'idle' : 'error',
              total_runs: newTotalRuns,
              successful_runs: newSuccessful,
              failed_runs: newFailed,
              avg_duration_ms: newAvgDuration,
              last_error: result.success ? null : result.errorMessage,
            })
            .eq('id', context.agentId);
        }

        console.log(
          `[Agent] Completed ${context.agentType} run ${context.runId} - ${result.success ? 'SUCCESS' : 'FAILED'}`
        );
      } catch (error) {
        console.error(`[Agent] Error completing run:`, error);
      }
    },

    /**
     * Check if agent is enabled for organization
     */
    isEnabled: async (
      supabase: SupabaseClient,
      agentType: string,
      organizationId: string
    ): Promise<boolean> => {
      const { data } = await supabase
        .from(registryTable)
        .select('is_enabled')
        .eq('organization_id', organizationId)
        .eq('agent_type', agentType)
        .single();

      return (data?.is_enabled as boolean) ?? false;
    },

    /**
     * Get agent configuration
     */
    getConfig: async (
      supabase: SupabaseClient,
      agentType: string,
      organizationId: string
    ): Promise<Record<string, unknown> | null> => {
      const { data } = await supabase
        .from(registryTable)
        .select('config')
        .eq('organization_id', organizationId)
        .eq('agent_type', agentType)
        .single();

      return data?.config as Record<string, unknown> | null;
    },

    /**
     * Queue a job for an agent
     */
    queueJob: async (
      supabase: SupabaseClient,
      agentType: string,
      organizationId: string,
      jobType: string,
      payload: Record<string, unknown>,
      priority: number = 5,
      scheduledFor?: Date
    ): Promise<string | null> => {
      try {
        // Get agent ID
        const { data: agent } = await supabase
          .from(registryTable)
          .select('id')
          .eq('organization_id', organizationId)
          .eq('agent_type', agentType)
          .single();

        if (!agent) {
          console.error(`[Agent] Agent ${agentType} not found for org ${organizationId}`);
          return null;
        }

        const { data, error } = await supabase
          .from(queueTable)
          .insert({
            organization_id: organizationId,
            agent_id: agent.id,
            job_type: jobType,
            priority,
            payload,
            scheduled_for: scheduledFor?.toISOString() || new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.error(`[Agent] Failed to queue job:`, error);
          return null;
        }

        return data.id as string;
      } catch (error) {
        console.error(`[Agent] Error queuing job:`, error);
        return null;
      }
    },

    /**
     * Get pending jobs for an agent
     */
    getPendingJobs: async (
      supabase: SupabaseClient,
      agentType: string,
      organizationId: string,
      limit: number = 10
    ): Promise<any[]> => {
      const { data: agent } = await supabase
        .from(registryTable)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('agent_type', agentType)
        .single();

      if (!agent) return [];

      const { data } = await supabase
        .from(queueTable)
        .select('*')
        .eq('agent_id', agent.id)
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

      return data || [];
    },
  };
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

/**
 * Log agent activity for observability
 */
export async function logAgentActivity(
  supabase: SupabaseClient,
  options: {
    organizationId: string;
    agentType: string;
    stepName: string;
    activityType: string;
    success: boolean;
    details?: Record<string, unknown>;
    durationMs?: number;
  }
): Promise<void> {
  try {
    await supabase.from('ai_agent_activity').insert({
      organization_id: options.organizationId,
      agent_type: options.agentType,
      step_name: options.stepName,
      activity_type: options.activityType,
      success: options.success,
      details: options.details || {},
      duration_ms: options.durationMs,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Agent] Failed to log activity:', error);
  }
}

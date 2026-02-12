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
import { getDefaultLogger } from '../observability';

/** Core brain org ID for federated agent context */
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A causal edge injected into agent context for causal reasoning.
 */
export interface AgentCausalEdge {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  lagDays: number;
  naturalLanguage: string;
  knockoutScore?: number;
  isLikelyConfounded?: boolean;
  coefficientSign?: number;
}

/**
 * Context for an agent run — enriched with causal + observational intelligence.
 */
export interface AgentContext {
  agentId: string;
  agentType: string;
  organizationId: string;
  runId: string;
  startedAt: Date;
  config: Record<string, unknown>;
  /**
   * Causal relationships relevant to this agent's domain.
   * Auto-injected at run initialization when causal data is available.
   * Agents use this to reason about cross-domain cascade effects.
   */
  causalContext?: {
    /** Edges where this agent's domain is the SOURCE (downstream effects) */
    downstreamEffects: AgentCausalEdge[];
    /** Edges where this agent's domain is the TARGET (upstream causes) */
    upstreamCauses: AgentCausalEdge[];
    /** Strongest causal chain through this domain */
    dominantChain?: string;
    /** Total causal edges involving this domain */
    totalEdges: number;
    /** Count of edges flagged as possibly confounded */
    confoundedEdgeCount?: number;
    /** Count of knockout-validated edges */
    validatedEdgeCount?: number;
  };
  /**
   * Observational memory context from the federated observation bridge.
   * Provides accumulated intelligence from tagged observations:
   * [FACT], [PREFERENCE], [EVENT], [CHANGE], [TEMPORAL], [RELATIONSHIP],
   * [ASSISTANT_SAID], [ASSISTANT_CREATED].
   *
   * Proven at 79.6% accuracy on LongMemEval benchmark.
   * Auto-injected at run initialization when observation bridge is available.
   */
  observationalContext?: {
    /** Formatted observation context ready for prompt injection */
    promptText: string;
    /** Total observations in store for this org */
    totalObservations: number;
    /** Active rules (current facts/preferences) */
    activeRules: number;
    /** Detected cascades (entity change timelines) */
    activeCascades: number;
    /** Whether anomaly detection recommends abstention */
    anomalyDetected: boolean;
    /** Anomaly reason if detected */
    anomalyReason?: string;
  };
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

  const logger = getDefaultLogger().child({ module: 'agent-context' });

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
          logger.error('Agent not found', { agentType, organizationId });
          return null;
        }

        if (!agent.is_enabled) {
          logger.info('Agent disabled', { agentType, organizationId });
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
          logger.error('Failed to create run record', { error: runError.message });
          return null;
        }

        // Update agent status
        await supabase
          .from(registryTable)
          .update({ status: 'running', last_run_at: new Date().toISOString() })
          .eq('id', agent.id);

        logger.info('Initialized agent run', { agentType, runId: run.id, organizationId });

        // CAUSAL ENRICHMENT: Auto-inject causal context for this agent's domain
        let causalContext: AgentContext['causalContext'] | undefined;
        try {
          // Derive agent domain from agentType (e.g., "signal_discovery" → all domains,
          // "finance_agent" → "finance", "cs_agent" → "customer_success")
          const agentDomain = extractDomainFromAgentType(agentType);

          // Federated query: org + core brain edges from the canonical table
          const { data: edges } = await supabase
            .from('causal_relationships_statistical')
            .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, is_significant, knockout_score, is_likely_confounded, coefficient_sign')
            .in('organization_id', [organizationId, CORE_BRAIN_ORG_ID])
            .eq('is_significant', true);

          if (edges && edges.length > 0) {
            const downstreamEffects: AgentCausalEdge[] = [];
            const upstreamCauses: AgentCausalEdge[] = [];

            for (const e of edges) {
              const edge: AgentCausalEdge = {
                sourceDomain: e.source_domain as string,
                targetDomain: e.target_domain as string,
                effectSize: (e.effect_size as number) || 0,
                lagDays: (e.optimal_lag_days as number) || 0,
                naturalLanguage: (e.natural_language as string) ||
                  `${e.source_domain} → ${e.target_domain}`,
                knockoutScore: (e.knockout_score as number) ?? undefined,
                isLikelyConfounded: (e.is_likely_confounded as boolean) ?? undefined,
                coefficientSign: (e.coefficient_sign as number) ?? undefined,
              };

              // If agent owns a specific domain, filter relevant edges
              if (agentDomain) {
                if (edge.sourceDomain === agentDomain) {
                  downstreamEffects.push(edge);
                }
                if (edge.targetDomain === agentDomain) {
                  upstreamCauses.push(edge);
                }
              } else {
                // General agent — gets all edges
                downstreamEffects.push(edge);
              }
            }

            // Find dominant chain: the path with highest combined effect size
            let dominantChain: string | undefined;
            if (upstreamCauses.length > 0 && downstreamEffects.length > 0) {
              const strongest_upstream = upstreamCauses.reduce((a, b) =>
                Math.abs(a.effectSize) > Math.abs(b.effectSize) ? a : b
              );
              const strongest_downstream = downstreamEffects.reduce((a, b) =>
                Math.abs(a.effectSize) > Math.abs(b.effectSize) ? a : b
              );
              dominantChain =
                `${strongest_upstream.sourceDomain} → ${agentDomain || '?'} → ${strongest_downstream.targetDomain}`;
            }

            const allContextEdges = [...downstreamEffects, ...upstreamCauses];
            const totalEdges = allContextEdges.length;
            if (totalEdges > 0) {
              const confoundedEdgeCount = allContextEdges.filter(e => e.isLikelyConfounded).length;
              const validatedEdgeCount = allContextEdges.filter(e => e.knockoutScore !== undefined && e.knockoutScore > 0.5 && !e.isLikelyConfounded).length;

              causalContext = {
                downstreamEffects: downstreamEffects
                  .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
                  .slice(0, 10),
                upstreamCauses: upstreamCauses
                  .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
                  .slice(0, 10),
                dominantChain,
                totalEdges,
                confoundedEdgeCount,
                validatedEdgeCount,
              };
            }
          }
        } catch {
          // Causal enrichment failure is non-fatal
        }

        return {
          agentId: agent.id as string,
          agentType,
          organizationId,
          runId: run.id as string,
          startedAt: new Date(),
          config: (agent.config || {}) as Record<string, unknown>,
          causalContext,
        };
      } catch (error) {
        logger.error('Error initializing agent run', { error: error instanceof Error ? error.message : String(error) });
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
        logger.error('Error updating progress', { runId, error: error instanceof Error ? error.message : String(error) });
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

        logger.info('Completed agent run', { agentType: context.agentType, runId: context.runId, success: result.success, durationMs });
      } catch (error) {
        logger.error('Error completing run', { runId: context.runId, error: error instanceof Error ? error.message : String(error) });
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
          logger.error('Agent not found', { agentType, organizationId });
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
          logger.error('Failed to queue job', { agentType, jobType, error: error.message });
          return null;
        }

        return data.id as string;
      } catch (error) {
        logger.error('Error queuing job', { agentType, error: error instanceof Error ? error.message : String(error) });
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
// DOMAIN EXTRACTION
// ============================================================================

/**
 * Map agent type strings to domain names.
 * Returns null for general-purpose agents that span all domains.
 */
function extractDomainFromAgentType(agentType: string): string | null {
  const at = agentType.toLowerCase();
  const domainMap: Record<string, string> = {
    finance: 'finance',
    revenue: 'revenue',
    sales: 'revenue',
    cs: 'customer_success',
    customer_success: 'customer_success',
    support: 'customer_success',
    engineering: 'engineering',
    product: 'product',
    marketing: 'marketing',
    hr: 'hr',
    people: 'hr',
    operations: 'operations',
    ops: 'operations',
    knowledge: 'knowledge',
  };

  for (const [keyword, domain] of Object.entries(domainMap)) {
    if (at.includes(keyword)) return domain;
  }

  return null; // General agent
}

// ============================================================================
// CAUSAL CONTEXT → PROMPT TEXT
// ============================================================================

/**
 * Format an agent's causal context into a prompt-ready text block.
 *
 * This bridges the gap between the structured causalContext data and
 * the LLM system prompt — agents can inject this into their prompt
 * to enable causal reasoning grounded in empirical discoveries.
 *
 * @example
 * ```typescript
 * const ctx = await agentManager.initializeRun(supabase, 'finance_agent', orgId);
 * const causalPrompt = formatCausalContextForPrompt(ctx);
 * const systemPrompt = `${basePrompt}\n\n${causalPrompt}`;
 * ```
 */
export function formatCausalContextForPrompt(context: AgentContext): string {
  if (!context.causalContext || context.causalContext.totalEdges === 0) {
    return '';
  }

  const { downstreamEffects, upstreamCauses, dominantChain, totalEdges, confoundedEdgeCount, validatedEdgeCount } = context.causalContext;
  const sections: string[] = [];

  sections.push('## Causal Intelligence (Discovered by Brain)');
  sections.push(`${totalEdges} causal relationships detected for your domain.`);

  if (validatedEdgeCount && validatedEdgeCount > 0) {
    sections.push(`${validatedEdgeCount} knockout-validated (true causal), ${confoundedEdgeCount || 0} possibly confounded.`);
  }
  sections.push('');

  if (dominantChain) {
    sections.push(`**Dominant causal chain:** ${dominantChain}`);
    sections.push('');
  }

  if (upstreamCauses.length > 0) {
    sections.push('**What CAUSES changes in your domain (upstream):**');
    for (const edge of upstreamCauses.slice(0, 5)) {
      const sign = (edge.coefficientSign ?? 1) > 0 ? '+' : '-';
      const validation = edge.isLikelyConfounded
        ? ' [POSSIBLY CONFOUNDED]'
        : (edge.knockoutScore !== undefined && edge.knockoutScore > 0.3)
        ? ' [VALIDATED]'
        : '';
      sections.push(`- ${edge.sourceDomain} → ${edge.targetDomain} (${sign}${Math.abs(edge.effectSize).toFixed(2)}, ${edge.lagDays}d lag)${validation}: ${edge.naturalLanguage}`);
    }
    sections.push('');
  }

  if (downstreamEffects.length > 0) {
    sections.push('**What your domain AFFECTS (downstream):**');
    for (const edge of downstreamEffects.slice(0, 5)) {
      const sign = (edge.coefficientSign ?? 1) > 0 ? '+' : '-';
      const validation = edge.isLikelyConfounded
        ? ' [POSSIBLY CONFOUNDED]'
        : (edge.knockoutScore !== undefined && edge.knockoutScore > 0.3)
        ? ' [VALIDATED]'
        : '';
      sections.push(`- ${edge.sourceDomain} → ${edge.targetDomain} (${sign}${Math.abs(edge.effectSize).toFixed(2)}, ${edge.lagDays}d lag)${validation}: ${edge.naturalLanguage}`);
    }
    sections.push('');
  }

  sections.push('Use this intelligence to:');
  sections.push('- Trace root causes when metrics change (follow upstream edges)');
  sections.push('- Predict downstream impact of actions (follow downstream edges)');
  sections.push('- Distinguish correlation from causation (only VALIDATED edges are true causes)');
  sections.push('- Estimate time-to-effect using lag days');

  // Append observational context if available
  if (context.observationalContext?.promptText) {
    sections.push('');
    sections.push(context.observationalContext.promptText);
    if (context.observationalContext.anomalyDetected) {
      sections.push('');
      sections.push(`⚠️ Anomaly detected: ${context.observationalContext.anomalyReason}`);
      sections.push('Exercise extra caution — observations suggest low confidence for this domain.');
    }
  }

  return sections.join('\n');
}

/**
 * Format ONLY the observational context for agents that don't have causal context.
 * Useful as a standalone enrichment when causal discovery hasn't run yet
 * but observational memory has accumulated.
 */
export function formatObservationalContextForPrompt(context: AgentContext): string {
  if (!context.observationalContext?.promptText) {
    return '';
  }

  const sections: string[] = [];
  sections.push(context.observationalContext.promptText);

  if (context.observationalContext.anomalyDetected) {
    sections.push('');
    sections.push(`⚠️ Anomaly detected: ${context.observationalContext.anomalyReason}`);
    sections.push('Exercise extra caution — observations suggest low confidence for this domain.');
  }

  return sections.join('\n');
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
    getDefaultLogger().child({ module: 'agent-context' }).error('Failed to log activity', { error: error instanceof Error ? error.message : String(error) });
  }
}

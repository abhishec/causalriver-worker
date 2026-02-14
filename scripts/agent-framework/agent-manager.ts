/**
 * Agent Manager — Executes agents and manages their lifecycle.
 * 
 * Features:
 * - Run agents by name from the registry
 * - Retry with exponential backoff on failure
 * - Timeout enforcement
 * - Persist run results to Supabase for audit trail
 * - Get run history for monitoring
 */

import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { AgentRegistry, type AgentRegistration } from './agent-registry';
import { type AgentConfig, type AgentRunResult } from './base-training-agent';

// ============================================================================
// AGENT MANAGER
// ============================================================================

export class AgentManager {
  private registry: AgentRegistry;
  private supabase: SupabaseClient;
  private defaultConfig: AgentConfig;

  constructor(
    registry: AgentRegistry,
    config: { supabaseUrl: string; supabaseKey: string; organizationId?: string },
  ) {
    this.registry = registry;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.defaultConfig = {
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      organizationId: config.organizationId,
    };
  }

  /**
   * Run a registered agent by name.
   */
  async runAgent(
    name: string,
    configOverrides?: Partial<AgentConfig>,
  ): Promise<AgentRunResult> {
    const config: AgentConfig = { ...this.defaultConfig, ...configOverrides };
    const agent = this.registry.createAgent(name, config);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  AgentManager: Running "${name}"`);
    console.log(`${'═'.repeat(60)}\n`);

    const result = await agent.run();

    // Persist run result
    await this.recordRun(result);

    return result;
  }

  /**
   * Run an agent with retry logic.
   */
  async runWithRetry(
    name: string,
    maxRetries: number = 3,
    configOverrides?: Partial<AgentConfig>,
  ): Promise<AgentRunResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AgentManager] Attempt ${attempt}/${maxRetries} for "${name}"`);
        const result = await this.runAgent(name, configOverrides);

        // If no errors, we're done
        if (result.errorsEncountered.length === 0) {
          return result;
        }

        // If there were errors but the agent completed, return the result
        // (partial success)
        if (attempt === maxRetries) {
          console.warn(`[AgentManager] "${name}" completed with ${result.errorsEncountered.length} errors after ${attempt} attempts`);
          return result;
        }

        // Wait before retry (exponential backoff: 5s, 10s, 20s, ...)
        const backoff = 5000 * Math.pow(2, attempt - 1);
        console.log(`[AgentManager] "${name}" had errors, retrying in ${backoff / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[AgentManager] Attempt ${attempt} failed for "${name}":`, lastError.message);

        if (attempt === maxRetries) {
          throw lastError;
        }

        const backoff = 5000 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError ?? new Error(`All ${maxRetries} attempts failed for "${name}"`);
  }

  /**
   * Run all registered agents sequentially.
   */
  async runAll(configOverrides?: Partial<AgentConfig>): Promise<AgentRunResult[]> {
    const results: AgentRunResult[] = [];
    for (const registration of this.registry.list()) {
      try {
        const result = await this.runAgent(registration.name, configOverrides);
        results.push(result);
      } catch (err) {
        console.error(`[AgentManager] Agent "${registration.name}" failed:`, err);
      }
    }
    return results;
  }

  /**
   * Persist run results to Supabase for audit trail.
   */
  async recordRun(result: AgentRunResult): Promise<void> {
    try {
      await this.supabase.from('ai_agent_activity').insert({
        organization_id: this.defaultConfig.organizationId || (() => {
          console.warn('[AgentManager] No organizationId in config, using CORE_ORG_ID fallback');
          return '00000000-0000-4000-a000-000000000001';
        })(),
        agent_type: result.agentName,
        action_type: 'training_run',
        input_summary: `v${result.agentVersion}: ${result.stages.map(s => s.name).join(' → ')}`,
        output_summary: result.summary,
        tokens_used: 0, // Training agents don't use LLM tokens
        metadata: {
          version: result.agentVersion,
          duration_ms: result.completedAt.getTime() - result.startedAt.getTime(),
          signalsGenerated: result.signalsGenerated,
          packsProcessed: result.packsProcessed,
          errorsCount: result.errorsEncountered.length,
          stages: result.stages,
          errors: result.errorsEncountered,
        },
      });
    } catch (err) {
      // Non-fatal: logging failure shouldn't crash the agent
      console.warn('[AgentManager] Failed to record run result:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Get run history for a specific agent.
   */
  async getRunHistory(agentName: string, limit: number = 20): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('ai_agent_activity')
        .select('*')
        .eq('agent_type', agentName)
        .eq('action_type', 'training_run')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[AgentManager] Failed to fetch run history:', error.message);
        return [];
      }

      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Print a summary of recent runs across all agents.
   */
  async printDashboard(): Promise<void> {
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│           NexusBrain Agent Dashboard            │');
    console.log('├─────────────────────────────────────────────────┤');

    for (const reg of this.registry.list()) {
      const history = await this.getRunHistory(reg.name, 3);
      console.log(`│`);
      console.log(`│ ${reg.name} v${reg.version}`);
      if (history.length === 0) {
        console.log(`│   No runs recorded`);
      } else {
        for (const run of history) {
          const meta = run.metadata || {};
          const duration = meta.duration_ms ? `${(meta.duration_ms / 1000).toFixed(0)}s` : '?';
          const errors = meta.errorsCount || 0;
          const status = errors === 0 ? '✓' : '⚠';
          console.log(`│   ${status} ${run.created_at?.substring(0, 16)} | ${duration} | ${meta.signalsGenerated ?? 0} signals | ${errors} errors`);
        }
      }
    }

    console.log('│');
    console.log('└─────────────────────────────────────────────────┘\n');
  }
}

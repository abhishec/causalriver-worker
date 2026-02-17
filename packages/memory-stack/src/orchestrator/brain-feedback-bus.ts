/**
 * Brain Feedback Bus — Unified Learning Circuit
 * ================================================
 *
 * Brain Analog: Basal Ganglia Reward Circuit + Hippocampal Memory Consolidation
 *   — every execution creates a learning signal, predictions get verified,
 *     weights get updated, and insights propagate across services
 *
 * THE UNIFIED FEEDBACK CONTRACT: Replaces per-service feedback implementations.
 * Every service (Copilot, SE-aaS, AAS) uses the same Bus to teach the Brain.
 *
 * 5 Channels:
 *   1. SIGNAL    — Brain observes activity (cross_domain_signals)
 *   2. PREDICTION — Predictions recorded for later verification (prediction_records)
 *   3. EVOLUTION  — Trigger brain learning cycle (Bayesian weight updates)
 *   4. OBSERVABILITY — Audit trail (obs_agent_executions + cross_domain_signals)
 *   5. INSIGHT PUSH — Cross-service intelligence propagation
 *
 * The moat: The more you use NexusBrain, the smarter it gets. This Bus is HOW.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runBrainEvolutionCycle } from './brain-evolution-engine';
import { createBrainObservabilityBridge } from './brain-observability-bridge';
import type { ServiceType } from './brain-context-mesh';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainFeedbackBusConfig {
  supabase: SupabaseClient;
  organizationId: string;
}

export interface SignalPayload {
  /** Source domain identifier (e.g., 'aas.bookkeeper', 'se-aas.sql-analyzer', 'copilot.chat') */
  sourceDomain: string;
  /** Signal type (e.g., 'domain_execution', 'agent_completion', 'user_feedback') */
  signalType: string;
  /** Confidence/value 0-1 */
  signalValue: number;
  /** Entity type that generated this signal */
  entityType: string;
  /** Entity identifier */
  entityId: string;
  /** Metadata bag */
  metadata: Record<string, unknown>;
}

export interface PredictionPayload {
  domain: string;
  predictedOutcome: string;
  predictedValue?: number | null;
  confidence: number;
  entityType: string;
  entityId: string;
  sourceRuleId?: string | null;
}

export interface ExecutionPayload {
  service: ServiceType;
  domainType: string;
  durationMs: number;
  claudePowered: boolean;
  brainAugmented: boolean;
  causalEdgesUsed: number;
  patternsUsed: number;
}

export interface InsightPayload {
  /** Type of insight */
  type: 'causal_edge' | 'anomaly' | 'pattern' | 'correction';
  /** Which domains should care about this insight */
  domains: string[];
  /** Human-readable description */
  content: string;
  /** Importance 0-1 */
  importance: number;
}

// ============================================================================
// BUS INSTANCE
// ============================================================================

export interface BrainFeedbackBusInstance {
  /** Channel 1: Emit a signal (Brain observes activity) */
  emitSignal(signal: SignalPayload): Promise<void>;
  /** Channel 2: Record a prediction for later verification */
  recordPrediction(prediction: PredictionPayload): Promise<void>;
  /** Channel 3: Trigger brain evolution (Bayesian weight updates) */
  triggerEvolution(opts?: { force?: boolean; cycleType?: 'lightweight' | 'full' }): Promise<void>;
  /** Channel 4: Record execution for observability */
  recordExecution(execution: ExecutionPayload): Promise<void>;
  /** Channel 5: Push insight for cross-service propagation */
  pushInsight(insight: InsightPayload): Promise<void>;
  /** Record multiple predictions from interventions (convenience) */
  recordInterventionPredictions(interventions: Array<{ description: string; type?: string }>, domain: string, confidence: number): Promise<void>;
}

// ============================================================================
// CREATE BUS — Factory Function
// ============================================================================

/** Execution counter for evolution throttling (per org, in-memory) */
const executionCounters = new Map<string, number>();

export function createBrainFeedbackBus(config: BrainFeedbackBusConfig): BrainFeedbackBusInstance {
  const { supabase, organizationId } = config;

  // ── Channel 1: Signal ──────────────────────────────────────────────────

  async function emitSignal(signal: SignalPayload): Promise<void> {
    try {
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: signal.sourceDomain,
        signal_type: signal.signalType,
        signal_value: signal.signalValue,
        entity_type: signal.entityType,
        entity_id: signal.entityId,
        signal_metadata: signal.metadata,
      });
    } catch {
      // Non-blocking: feedback failure should NEVER break execution
    }
  }

  // ── Channel 2: Prediction ──────────────────────────────────────────────

  async function recordPrediction(prediction: PredictionPayload): Promise<void> {
    try {
      await supabase.from('prediction_records').insert({
        organization_id: organizationId,
        domain: prediction.domain,
        predicted_outcome: prediction.predictedOutcome,
        predicted_value: prediction.predictedValue ?? null,
        confidence: prediction.confidence,
        entity_type: prediction.entityType,
        entity_id: prediction.entityId,
        source_rule_id: prediction.sourceRuleId ?? null,
      });
    } catch {
      // Non-blocking
    }
  }

  // ── Channel 3: Evolution ───────────────────────────────────────────────

  async function triggerEvolution(opts?: { force?: boolean; cycleType?: 'lightweight' | 'full' }): Promise<void> {
    try {
      const counter = (executionCounters.get(organizationId) ?? 0) + 1;
      executionCounters.set(organizationId, counter);

      // Only trigger every ~10 executions to avoid overhead (unless forced)
      if (opts?.force || counter % 10 === 0) {
        await runBrainEvolutionCycle(
          supabase,
          organizationId,
          opts?.cycleType ?? 'lightweight',
        );
      }
    } catch {
      // Non-blocking
    }
  }

  // ── Channel 4: Observability ───────────────────────────────────────────

  async function recordExecution(execution: ExecutionPayload): Promise<void> {
    try {
      const bridge = createBrainObservabilityBridge({
        supabase,
        organizationId,
      });
      await bridge.recordDomainExecution(
        execution.domainType,
        execution.durationMs,
        execution.claudePowered,
        execution.brainAugmented,
        execution.causalEdgesUsed,
        execution.patternsUsed,
      );
    } catch {
      // Non-blocking
    }
  }

  // ── Channel 5: Insight Push ────────────────────────────────────────────

  async function pushInsight(insight: InsightPayload): Promise<void> {
    try {
      // Write as a structured signal that other services will pick up
      // via their recentSignals queries in the Mesh
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: `brain.insight.${insight.type}`,
        signal_type: 'cross_service_insight',
        signal_value: insight.importance,
        entity_type: 'brain_insight',
        entity_id: `insight_${Date.now()}`,
        signal_metadata: {
          type: insight.type,
          domains: insight.domains,
          content: insight.content,
          importance: insight.importance,
          pushedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Non-blocking
    }
  }

  // ── Convenience: Record intervention predictions ────────────────────────

  async function recordInterventionPredictions(
    interventions: Array<{ description: string; type?: string }>,
    domain: string,
    confidence: number,
  ): Promise<void> {
    for (const intervention of interventions.slice(0, 5)) {
      await recordPrediction({
        domain,
        predictedOutcome: intervention.description,
        confidence,
        entityType: `${domain}_intervention`,
        entityId: intervention.type ?? domain,
      });
    }
  }

  return {
    emitSignal,
    recordPrediction,
    triggerEvolution,
    recordExecution,
    pushInsight,
    recordInterventionPredictions,
  };
}

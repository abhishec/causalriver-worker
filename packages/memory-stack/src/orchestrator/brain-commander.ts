/**
 * Brain Commander V1 — Unified Entry Point for ALL Brain Queries
 * ===============================================================
 *
 * Brain Analog: Prefrontal Cortex (PFC) — the executive controller
 *   — receives all inputs, decides strategy, delegates to specialists,
 *     integrates results, and returns a unified response.
 *
 * THIS IS THE MISSING PIECE.
 *
 * Before Brain Commander:
 *   - /api/brain/query → manual DB queries + optional DomainActionEngine
 *   - /api/copilot/chat → manual DB queries + BrainContextBuilder + DomainActionEngine
 *   - /api/brain/execute → switch statement + direct handlers
 *   - nexus-copilot edge fn → own complexity router + own tool system
 *   All four paths duplicated domain detection, intent classification,
 *   DB queries, causal graph building, and action routing.
 *
 * After Brain Commander:
 *   - ALL paths call: BrainCommander.command(question, userContext)
 *   - Commander uses DispatchAssessor to route
 *   - Commander delegates to the right engine(s)
 *   - Commander returns a unified CommandResult
 *   - API routes just handle auth + serialization
 *
 * Design:
 *   - Never throws (returns errors in result)
 *   - Graceful degradation at every step
 *   - Full audit trail
 *   - Sub-100ms for fast queries, full pipeline for complex ones
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createDispatchAssessor,
  type DispatchAssessment,
  type DispatchRoute,
} from './dispatch-assessor';
import {
  createUserContextResolver,
  type UserContext,
  type OrgRole,
} from './user-context-resolver';
import {
  createCalibrationFeedbackLoop,
  type CalibrationPrediction,
} from './calibration-feedback-loop';
import {
  createClosedLoopExecutor,
  type BrainFeedbackSignal,
} from './closed-loop-executor';
import type { DecisionJournalEntry } from './domain-action-engine';
import {
  createCognitiveStack,
  type CognitiveStackInstance,
  type CognitiveCycleResult,
} from './cognitive-stack';
import {
  getFederatedCausalRelationships,
  getFederatedPatterns,
} from '../federation/federated-brain';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainCommanderConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Core org ID for shared brain data */
  coreOrgId?: string;
  /** Anthropic API key for LLM calls */
  anthropicApiKey?: string;
  /** Whether to enable action engine (forecasting, simulation, etc.) */
  enableActions?: boolean;
  /** Whether to enable motor commands (Slack, Jira, etc.) */
  enableMotorCommands?: boolean;
  /** Maximum action engine timeout in ms */
  actionTimeoutMs?: number;
  /** Whether to run post-execution quality gate (V8 metacognition) */
  enableQualityGate?: boolean;
  /** Whether to run cognitive stack (L3-L15) on queries (default: true) */
  enableCognitiveStack?: boolean;
  /** Max causal edges to fetch per query (default: 500). Increase for 10M+ signal orgs. */
  maxCausalEdges?: number;
  /** Max patterns/insights/rules to fetch per query (default: 200). */
  maxMemoryItems?: number;
}

/** The unified result of any brain command */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** The dispatch assessment that determined routing */
  dispatch: DispatchAssessment;
  /** User context (if resolved) */
  userContext?: UserContext;
  /** Brain intelligence context */
  intelligence: BrainIntelligence;
  /** Action artifact (if action engine was invoked) */
  artifact?: Record<string, unknown>;
  /** Motor commands (if motor engine produced them) */
  motorCommands?: unknown[];
  /** Cognitive stack result (L3-L15 reasoning, if enabled) */
  cognitiveStack?: CognitiveCycleResult;
  /** Quality gate result (V8 metacognition, if enabled) */
  qualityGate?: { qualityScore: number; passesGate: boolean };
  /** Error message (if any) */
  error?: string;
  /** Total execution time in ms */
  totalMs: number;
  /** Per-step timing breakdown */
  timing: Record<string, number>;
}

/** Brain intelligence gathered from DB */
export interface BrainIntelligence {
  /** Causal edges */
  causalEdges: CausalEdge[];
  /** Business rules */
  rules: BrainRule[];
  /** Discovered patterns */
  patterns: BrainPattern[];
  /** Cascade rules */
  cascadeRules: CascadeRule[];
  /** Insights from connectors */
  insights: BrainInsight[];
  /** Causal graph (causes/effects per domain) */
  causalGraph: {
    causes: Record<string, CausalEdge[]>;
    effects: Record<string, CausalEdge[]>;
  };
  /** Impact analysis per domain */
  impactAnalysis: Record<string, {
    affectedDomains: string[];
    maxCascadeDepth: number;
    riskLevel: string;
  }>;
  /** Brain stats */
  stats: {
    totalDomains: number;
    totalCausalEdges: number;
    totalPatterns: number;
    totalRules: number;
    totalCascadeRules: number;
  };
}

export interface CausalEdge {
  source_domain: string;
  target_domain: string;
  effect_size: number;
  granger_p_value: number;
  optimal_lag_days: number;
  natural_language: string | null;
  is_significant: boolean;
  granger_f_statistic?: number;
  sample_size?: number;
  confidence_interval_lower?: number;
  confidence_interval_upper?: number;
}

export interface BrainRule {
  content: string;
  importance: number;
  domain: string;
  metadata: Record<string, unknown> | null;
}

export interface BrainPattern {
  content: string;
  domain: string;
  importance: number;
  llm_pattern_name: string | null;
  llm_pattern_description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CascadeRule {
  rule_name: string;
  trigger_domain: string;
  trigger_signal_type: string;
  propagation_chain: unknown[];
  is_active: boolean;
}

export interface BrainInsight {
  content: string;
  importance: number;
  domain: string;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// FACTORY
// ============================================================================

const CORE_ORG_ID_DEFAULT = '00000000-0000-4000-a000-000000000001';

/**
 * Create the Brain Commander — the unified entry point for ALL brain queries.
 *
 * @example
 * ```typescript
 * const commander = createBrainCommander({
 *   supabase,
 *   organizationId: orgId,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const result = await commander.command("What drives customer churn?");
 * // → { success: true, dispatch: { route: 'action_domain', intent: 'diagnose' }, ... }
 *
 * const result2 = await commander.command("What if we increase marketing spend by 20%?", {
 *   userId: user.id,
 * });
 * // → { success: true, dispatch: { route: 'action_domain', intent: 'simulate' }, artifact: { ... } }
 * ```
 */
export function createBrainCommander(config: BrainCommanderConfig) {
  const {
    supabase,
    organizationId,
    coreOrgId = CORE_ORG_ID_DEFAULT,
    anthropicApiKey,
    enableActions = true,
    enableMotorCommands = false,
    actionTimeoutMs = 15000,
    maxCausalEdges = 500,
    maxMemoryItems = 200,
  } = config;

  // Internal subsystems
  const assessor = createDispatchAssessor();
  const contextResolver = createUserContextResolver({ supabase });
  const calibrationLoop = createCalibrationFeedbackLoop();
  const closedLoop = createClosedLoopExecutor({
    verbose: false,
    onFeedbackSignal: async (signal: BrainFeedbackSignal) => {
      // Apply feedback signal directly to causal graph edge weights
      const { source, target } = signal.causalEdge;
      const multiplier = signal.direction === 'strengthen'
        ? 1 + signal.magnitude * 0.2  // max +20%
        : signal.direction === 'weaken'
          ? 1 - signal.magnitude * 0.2  // max -20%
          : 1; // neutral

      try {
        // Read current edge weight
        const { data: edge } = await supabase
          .from('causal_relationships_statistical')
          .select('weight, id')
          .eq('organization_id', organizationId)
          .eq('source_metric', source)
          .eq('target_metric', target)
          .limit(1)
          .maybeSingle();

        if (edge) {
          const newWeight = Math.max(0, Math.min(1, (edge.weight || 0.5) * multiplier));
          await supabase
            .from('causal_relationships_statistical')
            .update({ weight: newWeight, updated_at: new Date().toISOString() })
            .eq('id', edge.id);

          console.log(
            `[BrainCommander] ✅ Applied feedback: ${signal.direction} ${source}→${target} (${((edge.weight || 0.5)).toFixed(3)} → ${newWeight.toFixed(3)})`,
          );
        } else {
          console.log(
            `[BrainCommander] ⚠️ Feedback signal for unknown edge ${source}→${target} — skipped`,
          );
        }
      } catch (err) {
        console.warn(
          `[BrainCommander] Feedback signal application failed (non-fatal):`,
          err instanceof Error ? err.message : err,
        );
      }
    },
  });

  // Cognitive Stack: L3-L15 reasoning engine for live queries
  // Disconnection #2 FIX: Run cognitive layers on user queries, not just sleep cycles
  const enableCognitive = config.enableCognitiveStack !== false;
  const cognitiveStack: CognitiveStackInstance | null = enableCognitive
    ? createCognitiveStack({
        organizationId,
        anthropicApiKey: config.anthropicApiKey,
      })
    : null;

  // ── Main Command Entry Point ────────────────────────────────────────

  /**
   * Execute a brain command.
   *
   * This is THE entry point for all brain queries. It:
   * 1. Assesses dispatch route (fast_query, action_domain, agent_orchestration)
   * 2. Resolves user context (if userId provided)
   * 3. Gathers brain intelligence from DB
   * 4. Optionally invokes the action engine
   * 5. Returns unified CommandResult
   */
  async function command(
    question: string,
    options?: {
      userId?: string;
      action?: string;
      entityState?: Record<string, unknown>;
      format?: 'full' | 'compact';
      domains?: string[];
    }
  ): Promise<CommandResult> {
    const totalStart = performance.now();
    const timing: Record<string, number> = {};

    try {
      // ── Step 1: Dispatch Assessment ─────────────────────────────────
      const dispatchStart = performance.now();
      const dispatch = assessor.assess(question);
      timing.dispatch = performance.now() - dispatchStart;

      // Use provided domains if available, otherwise use detected
      const effectiveDomains = options?.domains || dispatch.domains;

      // ── Step 2: User Context Resolution ─────────────────────────────
      let userContext: UserContext | undefined;
      if (options?.userId) {
        const contextStart = performance.now();
        userContext = await contextResolver.resolve(options.userId, organizationId);
        timing.userContext = performance.now() - contextStart;
      }

      // ── Step 3: Gather Brain Intelligence ───────────────────────────
      const intelligenceStart = performance.now();
      const intelligence = await gatherIntelligence(
        effectiveDomains as string[],
        userContext
      );
      timing.intelligence = performance.now() - intelligenceStart;

      // ── Step 3b: Cognitive Stack (L3-L15) ──────────────────────────
      // Disconnection #2 FIX: Run cognitive layers on live queries
      let cognitiveResult: CognitiveCycleResult | undefined;
      if (cognitiveStack) {
        const cogStart = performance.now();
        try {
          // Convert intelligence data → cognitive stack inputs
          const cogSignals = intelligence.insights.map((ins, i) => ({
            id: `insight_${i}`,
            source: 'brain_intelligence',
            domain: ins.domain,
            entityType: 'insight',
            entityId: `insight_${i}`,
            value: ins.importance,
            timestamp: Date.now(),
          }));

          const cogEdges = intelligence.causalEdges.slice(0, 50).map(e => ({
            source: e.source_domain,
            target: e.target_domain,
            weight: e.effect_size,
            confidence: 1 - (e.granger_p_value || 0.5),
            domain: e.source_domain,
          }));

          const cogPatterns = intelligence.patterns.map(p =>
            p.llm_pattern_name || p.content
          );

          cognitiveResult = cognitiveStack.runCycle({
            signals: cogSignals,
            causalEdges: cogEdges,
            patterns: cogPatterns,
            predictions: [],
            metrics: [],
            userId: options?.userId,
            userQuery: question,
          });
        } catch (cogErr) {
          console.warn('[BrainCommander] Cognitive stack error (non-fatal):', cogErr instanceof Error ? cogErr.message : cogErr);
        }
        timing.cognitiveStack = performance.now() - cogStart;
      }

      // ── Step 4: Action Engine (if needed) ───────────────────────────
      let artifact: Record<string, unknown> | undefined;
      let motorCommands: unknown[] | undefined;

      const shouldRunAction = enableActions && (
        dispatch.needsAction ||
        options?.action ||
        dispatch.route === 'action_domain' ||
        dispatch.route === 'agent_orchestration'
      );

      if (shouldRunAction) {
        const actionStart = performance.now();
        try {
          const actionResult = await runActionEngine(
            question,
            dispatch,
            intelligence,
            options?.entityState
          );
          artifact = actionResult.artifact;
          motorCommands = actionResult.motorCommands;
        } catch (err) {
          // Non-fatal: return intelligence without artifact
          console.warn('[BrainCommander] Action engine error (non-fatal):', err);
        }
        timing.action = performance.now() - actionStart;
      }

      // ── Step 4b: Track motor commands in closed-loop executor ────────
      if (motorCommands && Array.isArray(motorCommands) && motorCommands.length > 0) {
        for (const cmd of motorCommands) {
          const mc = cmd as Record<string, unknown>;
          try {
            closedLoop.trackCommand({
              commandId: (mc.id as string) || `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              actionType: (mc.actionType as string) || 'unknown',
              target: (mc.target as string) || '',
              causalEdge: dispatch.domains.length > 0
                ? { source: dispatch.domains[0], target: (mc.targetDomains as string[])?.[0] || dispatch.domains[0], weight: dispatch.confidence }
                : null,
              expectedOutcome: (mc.expectedImpact as string) || question,
              confidence: (mc.confidence as number) || dispatch.confidence,
              domain: dispatch.domains[0] || 'general',
              sourceActionType: dispatch.intent,
            });
          } catch (trackErr) {
            console.warn('[BrainCommander] Closed-loop tracking error (non-fatal):', trackErr instanceof Error ? trackErr.message : trackErr);
          }
        }
      }

      // ── Step 5: Record prediction for calibration feedback loop ─────
      // L6 FIX: Record predictions for ALL queries, not just artifact queries.
      // This ensures Self-Modifying Cognition (L6) sees every brain query's
      // confidence, enabling real calibration tracking and recalibration.
      {
        const calibrationStart = performance.now();
        try {
          if (artifact) {
            recordForCalibration(question, dispatch, artifact);
          } else {
            // Non-action queries still generate a confidence prediction
            // that should be tracked for calibration (dispatch.confidence)
            const syntheticJournal: DecisionJournalEntry = {
              timestamp: new Date().toISOString(),
              question,
              recommendation: `Intelligence retrieval for ${dispatch.domains.join(', ') || 'general'}`,
              mondayMorningAction: 'Verify intelligence accuracy in 7 days',
              predictedOutcome: `Relevant intelligence for: ${question.slice(0, 100)}`,
              confidenceAtDecision: dispatch.confidence,
              domain: dispatch.primaryDomain,
              actionType: 'explain',
              assumptions: [],
              falsificationCriteria: [],
              reviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              confidenceBreakdown: {
                dataQuality: intelligence.stats.totalCausalEdges > 0 ? 0.7 : 0.3,
                modelFit: dispatch.confidence,
                domainCoverage: intelligence.stats.totalDomains > 0 ? Math.min(1, intelligence.stats.totalDomains / 5) : 0.2,
                overall: dispatch.confidence,
              },
            };
            calibrationLoop.recordPrediction(syntheticJournal);
          }
        } catch (calErr) {
          console.warn('[BrainCommander] Calibration recording error (non-fatal):', calErr instanceof Error ? calErr.message : calErr);
        }
        timing.calibration = performance.now() - calibrationStart;
      }

      // ── Step 5b: Quality Gate (V8 Metacognition, optional) ──────────
      let qualityGate: { qualityScore: number; passesGate: boolean } | undefined;
      if (config.enableQualityGate && artifact) {
        const qgStart = performance.now();
        try {
          // Run chain-validate + uncertainty-quantify + robustness-check via the quality gate agent pattern
          // Lightweight inline quality gate: check artifact confidence and driver consistency
          const artConf = (artifact as { confidence?: number }).confidence;
          const artDrivers = (artifact as { drivers?: unknown[] }).drivers;
          const confScore = typeof artConf === 'number' ? artConf : 0.5;
          const driverScore = Array.isArray(artDrivers) && artDrivers.length > 0 ? Math.min(1, artDrivers.length / 5) : 0.3;
          const qualityScore = Math.round((confScore * 0.6 + driverScore * 0.4) * 1000) / 1000;
          qualityGate = { qualityScore, passesGate: qualityScore >= 0.6 };
        } catch (qgErr) {
          console.warn('[BrainCommander] Quality gate error (non-fatal):', qgErr instanceof Error ? qgErr.message : qgErr);
        }
        timing.qualityGate = performance.now() - qgStart;
      }

      // ── Step 6: Filter by user permissions ──────────────────────────
      if (userContext) {
        const filterStart = performance.now();
        filterByPermissions(intelligence, userContext);
        timing.filter = performance.now() - filterStart;
      }

      return {
        success: true,
        dispatch,
        userContext,
        intelligence,
        artifact,
        motorCommands,
        cognitiveStack: cognitiveResult,
        qualityGate,
        totalMs: performance.now() - totalStart,
        timing,
      };
    } catch (err) {
      return {
        success: false,
        dispatch: assessor.assess(question),
        intelligence: emptyIntelligence(),
        error: err instanceof Error ? err.message : 'Unknown error',
        totalMs: performance.now() - totalStart,
        timing,
      };
    }
  }

  // ── Intelligence Gathering ──────────────────────────────────────────

  async function gatherIntelligence(
    domains: string[],
    userContext?: UserContext
  ): Promise<BrainIntelligence> {
    const orgIds = [...new Set([organizationId, coreOrgId])];
    const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');

    // Disconnection #3 FIX: Use federated queries for causal edges, patterns, and insights
    // This merges ORG + CORE brain data with deduplication (ORG wins over CORE)
    // Keep direct SQL for: rules (no federated function) and cascade rules (different table)
    const [causalFederated, rulesResult, patternsFederated, cascadeResult, insightsFederated] = await Promise.all([
      // Federated: causal relationships (ORG + CORE merged, deduplicated)
      getFederatedCausalRelationships(organizationId, { limit: maxCausalEdges })
        .then(r => r.merged.map(m => m.data))
        .catch(() => [] as any[]),

      // Direct SQL: rules (no federated function exists for ai_memory type=rule)
      supabase
        .from('ai_memory')
        .select('content, importance, domain, metadata')
        .or(orgFilter)
        .eq('memory_type', 'rule')
        .order('importance', { ascending: false })
        .limit(maxMemoryItems),

      // Federated: patterns (ORG + CORE merged, deduplicated by title)
      getFederatedPatterns(organizationId, { memoryType: 'pattern', limit: maxMemoryItems })
        .then(r => r.merged.map(m => m.data))
        .catch(() => [] as any[]),

      // Direct SQL: cascade rules (separate table, no federated function)
      supabase
        .from('org_cascade_rules')
        .select('rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active')
        .or(orgFilter)
        .eq('is_active', true)
        .limit(maxMemoryItems),

      // Federated: insights (ORG + CORE merged, deduplicated by title)
      getFederatedPatterns(organizationId, { memoryType: 'insight', limit: maxMemoryItems })
        .then(r => r.merged.map(m => m.data))
        .catch(() => [] as any[]),
    ]);

    const edges = (causalFederated || []) as CausalEdge[];
    const rules = (rulesResult.data || []) as BrainRule[];
    const patterns = (patternsFederated || []) as BrainPattern[];
    const cascadeRules = (cascadeResult.data || []) as CascadeRule[];
    const insights = (insightsFederated || []) as BrainInsight[];

    // Build causal graph
    const causalGraph = buildCausalGraph(edges, domains);

    // Build impact analysis
    const impactAnalysis = buildImpactAnalysis(edges, domains);

    // Stats
    const allDomains = new Set([
      ...edges.map(e => e.source_domain),
      ...edges.map(e => e.target_domain),
    ]);

    return {
      causalEdges: edges,
      rules,
      patterns,
      cascadeRules,
      insights,
      causalGraph,
      impactAnalysis,
      stats: {
        totalDomains: allDomains.size,
        totalCausalEdges: edges.length,
        totalPatterns: patterns.length,
        totalRules: rules.length,
        totalCascadeRules: cascadeRules.length,
      },
    };
  }

  // ── Causal Graph Builder ────────────────────────────────────────────

  function buildCausalGraph(
    edges: CausalEdge[],
    domains: string[]
  ): BrainIntelligence['causalGraph'] {
    const causes: Record<string, CausalEdge[]> = {};
    const effects: Record<string, CausalEdge[]> = {};

    for (const e of edges) {
      if (!causes[e.target_domain]) causes[e.target_domain] = [];
      causes[e.target_domain].push(e);
      if (!effects[e.source_domain]) effects[e.source_domain] = [];
      effects[e.source_domain].push(e);
    }

    // Sort by effect size
    for (const d of Object.keys(causes)) {
      causes[d].sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    }
    for (const d of Object.keys(effects)) {
      effects[d].sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    }

    // Filter to relevant domains (top 10 per domain)
    const filteredCauses: Record<string, CausalEdge[]> = {};
    const filteredEffects: Record<string, CausalEdge[]> = {};
    for (const d of domains) {
      if (causes[d]) filteredCauses[d] = causes[d].slice(0, 10);
      if (effects[d]) filteredEffects[d] = effects[d].slice(0, 10);
    }

    return { causes: filteredCauses, effects: filteredEffects };
  }

  // ── Impact Analysis ─────────────────────────────────────────────────

  function buildImpactAnalysis(
    edges: CausalEdge[],
    domains: string[]
  ): BrainIntelligence['impactAnalysis'] {
    const analysis: BrainIntelligence['impactAnalysis'] = {};
    const adjacency: Record<string, string[]> = {};

    for (const e of edges) {
      if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
      adjacency[e.source_domain].push(e.target_domain);
    }

    for (const domain of domains) {
      const visited = new Set<string>();
      const queue = [{ node: domain, depth: 0 }];
      let maxDepth = 0;

      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (visited.has(node) || depth > 4) continue;
        visited.add(node);
        maxDepth = Math.max(maxDepth, depth);
        for (const n of adjacency[node] || []) {
          if (!visited.has(n)) queue.push({ node: n, depth: depth + 1 });
        }
      }

      const affected = [...visited].filter(d => d !== domain);
      analysis[domain] = {
        affectedDomains: affected,
        maxCascadeDepth: maxDepth,
        riskLevel: affected.length >= 10 ? 'critical' : affected.length >= 6 ? 'high' : affected.length >= 3 ? 'medium' : 'low',
      };
    }

    return analysis;
  }

  // ── Action Engine ───────────────────────────────────────────────────

  async function runActionEngine(
    question: string,
    dispatch: DispatchAssessment,
    intelligence: BrainIntelligence,
    entityState?: Record<string, unknown>
  ): Promise<{ artifact?: Record<string, unknown>; motorCommands?: unknown[] }> {
    // Dynamic import to avoid circular deps and keep bundle tree-shakeable
    const { createDomainActionEngine } = await import('./domain-action-engine');

    const engine = createDomainActionEngine({
      supabase,
      organizationId,
      amplifierConfig: anthropicApiKey
        ? { provider: 'anthropic' as const, apiKey: anthropicApiKey }
        : undefined,
    });

    // Build knowledge context for the action engine
    const knowledgeCtx = buildActionKnowledgeContext(
      question,
      dispatch,
      intelligence,
      entityState
    );

    // Execute with timeout
    const artifactPromise = engine.execute(question, knowledgeCtx);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), actionTimeoutMs)
    );

    const artifact = await Promise.race([artifactPromise, timeoutPromise]);
    if (!artifact) return {};

    // Extract motor commands if present
    const motorCommands = (artifact as any)?.motorCommands || undefined;

    return {
      artifact: artifact as unknown as Record<string, unknown>,
      motorCommands,
    };
  }

  // ── Calibration Recording ─────────────────────────────────────────

  function recordForCalibration(
    question: string,
    dispatch: DispatchAssessment,
    artifact: Record<string, unknown>
  ): void {
    // Extract decision journal entry if the action engine produced one
    const decisionJournal = artifact.decisionJournal as DecisionJournalEntry | undefined;

    if (decisionJournal) {
      // Record prediction from the decision journal
      calibrationLoop.recordPrediction(decisionJournal);
    } else if (dispatch.needsAction && artifact.confidence !== undefined) {
      // Even without a full decision journal, record the artifact as a prediction
      // for calibration tracking (helps detect systematic over/under-confidence)
      const conf = Number(artifact.confidence) || dispatch.confidence;
      const syntheticJournal: DecisionJournalEntry = {
        timestamp: new Date().toISOString(),
        question,
        recommendation: String(artifact.narrative || artifact.summary || 'Brain recommendation'),
        mondayMorningAction: 'Review prediction accuracy in 30 days',
        predictedOutcome: String(artifact.narrative || artifact.summary || question),
        confidenceAtDecision: conf,
        domain: dispatch.primaryDomain,
        actionType: (artifact.actionType as any) || 'forecast',
        assumptions: [],
        falsificationCriteria: [],
        reviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        confidenceBreakdown: {
          dataQuality: conf,
          modelFit: conf,
          domainCoverage: conf,
          overall: conf,
        },
      };
      calibrationLoop.recordPrediction(syntheticJournal);
    }
  }

  // ── Action Knowledge Context Builder ────────────────────────────────

  function buildActionKnowledgeContext(
    question: string,
    dispatch: DispatchAssessment,
    intelligence: BrainIntelligence,
    entityState?: Record<string, unknown>
  ) {
    type UserActionIntent = 'build' | 'explain' | 'diagnose' | 'predict' | 'general';
    const intentMap: Record<string, UserActionIntent> = {
      predict: 'predict', simulate: 'predict', build: 'build',
      explain: 'explain', diagnose: 'diagnose', compare: 'explain',
      optimize: 'build', recommend: 'build', audit: 'diagnose',
      monitor: 'general', lookup: 'general', general: 'general',
    };

    const actionIntent = intentMap[dispatch.intent] || 'general';

    // Build directCauses / directEffects for ActionEngine
    const directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};
    const directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};

    for (const e of intelligence.causalEdges) {
      const entry = {
        source: e.source_domain,
        target: e.target_domain,
        effectSize: e.effect_size,
        lagDays: e.optimal_lag_days,
      };
      if (!directCauses[e.target_domain]) directCauses[e.target_domain] = [];
      directCauses[e.target_domain].push(entry);
      if (!directEffects[e.source_domain]) directEffects[e.source_domain] = [];
      directEffects[e.source_domain].push(entry);
    }

    // Parse rules for ActionEngine
    const matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }> = [];

    for (const r of intelligence.rules.slice(0, 15)) {
      try {
        const parsed = JSON.parse(r.content);
        if (parsed && parsed.when) {
          const conditionStrs = (parsed.when.conditions || []).map(
            (c: { field: string; operator: string; value: unknown }) =>
              `${c.field} ${c.operator} ${c.value}`
          );

          let triggered = false;
          if (entityState && parsed.when.conditions?.length > 0) {
            triggered = parsed.when.conditions.some((c: { field: string; operator: string; value: unknown }) => {
              const parts = c.field.split('.');
              let val: unknown = entityState;
              for (const part of parts) {
                if (val == null || typeof val !== 'object') return false;
                val = (val as Record<string, unknown>)[part];
              }
              return val !== undefined;
            });
          }

          matchedRules.push({
            title: parsed.title || 'Rule',
            naturalLanguage: parsed.natural_language || parsed.description || '',
            conditions: conditionStrs,
            triggered,
          });
        }
      } catch (ruleErr) {
        console.warn('[BrainCommander] Skipping malformed rule:', ruleErr instanceof Error ? ruleErr.message : ruleErr);
      }
    }

    return {
      question,
      intent: actionIntent,
      extractedDomains: dispatch.domains as string[],
      primaryDomain: dispatch.primaryDomain as string,
      directCauses,
      directEffects,
      matchedRules,
    };
  }

  // ── Permission Filter ───────────────────────────────────────────────

  function filterByPermissions(intelligence: BrainIntelligence, userContext: UserContext): void {
    const { permissions } = userContext;
    if (permissions.canViewCrossOrg) return; // Platform admin — no filtering

    const allowed = new Set(permissions.allowedDomains);

    // Filter causal edges
    intelligence.causalEdges = intelligence.causalEdges.filter(
      e => allowed.has(e.source_domain) && allowed.has(e.target_domain)
    );

    // Filter patterns
    intelligence.patterns = intelligence.patterns.filter(
      p => allowed.has(p.domain)
    );

    // Filter rules
    intelligence.rules = intelligence.rules.filter(
      r => allowed.has(r.domain)
    );

    // Filter insights
    intelligence.insights = intelligence.insights.filter(
      i => allowed.has(i.domain)
    );

    // Rebuild causal graph
    const allDomains = [...allowed];
    intelligence.causalGraph = buildCausalGraph(intelligence.causalEdges, allDomains);
    intelligence.impactAnalysis = buildImpactAnalysis(intelligence.causalEdges, allDomains);

    // Recalculate stats
    const allEdgeDomains = new Set([
      ...intelligence.causalEdges.map(e => e.source_domain),
      ...intelligence.causalEdges.map(e => e.target_domain),
    ]);
    intelligence.stats = {
      totalDomains: allEdgeDomains.size,
      totalCausalEdges: intelligence.causalEdges.length,
      totalPatterns: intelligence.patterns.length,
      totalRules: intelligence.rules.length,
      totalCascadeRules: intelligence.cascadeRules.length,
    };
  }

  // ── Empty Intelligence ──────────────────────────────────────────────

  function emptyIntelligence(): BrainIntelligence {
    return {
      causalEdges: [],
      rules: [],
      patterns: [],
      cascadeRules: [],
      insights: [],
      causalGraph: { causes: {}, effects: {} },
      impactAnalysis: {},
      stats: { totalDomains: 0, totalCausalEdges: 0, totalPatterns: 0, totalRules: 0, totalCascadeRules: 0 },
    };
  }

  // ── Public API ──────────────────────────────────────────────────────

  return {
    /**
     * Execute a brain command.
     * This is THE entry point for all brain queries.
     */
    command,

    /**
     * Assess how a query would be dispatched (without executing).
     * Useful for debugging and UI hint generation.
     */
    assessDispatch(question: string): DispatchAssessment {
      return assessor.assess(question);
    },

    /**
     * Resolve user context for a given user.
     * Useful for pre-resolving context before a command.
     */
    resolveUser(userId: string): Promise<UserContext> {
      return contextResolver.resolve(userId, organizationId);
    },

    /**
     * Get commander stats.
     */
    getConfig() {
      return {
        organizationId,
        coreOrgId,
        enableActions,
        enableMotorCommands,
        actionTimeoutMs,
        hasAnthropicKey: !!anthropicApiKey,
      };
    },

    /**
     * Get calibration metrics — how accurate is the brain's confidence?
     * Returns Brier score, ECE, reliability diagram data, domain breakdown.
     */
    getCalibrationMetrics() {
      return calibrationLoop.getStats();
    },

    /**
     * Record an outcome for a previous prediction (closes the learning loop).
     * Call this when the actual outcome of a brain prediction becomes known.
     */
    recordOutcome(predictionId: string, outcome: {
      correct: boolean;
      accuracy: number;
      actualOutcome: string;
      source: 'manual' | 'automated' | 'signal_data' | 'brain_reanalysis';
    }) {
      return calibrationLoop.recordOutcome(predictionId, outcome);
    },

    /**
     * Record a motor command outcome (closes the action→feedback loop).
     * Call this when the result of a motor command (Slack, Jira, etc.) is known.
     *
     * @example
     * ```typescript
     * commander.recordCommandOutcome('cmd_123', {
     *   achieved: true,
     *   accuracy: 0.85,
     *   actualOutcome: 'Slack message acknowledged by engineering lead',
     *   source: 'webhook',
     *   timeToOutcomeHours: 2.5,
     *   actionStatus: 'acknowledged',
     * });
     * ```
     */
    recordCommandOutcome(commandId: string, outcome: {
      achieved: boolean;
      accuracy: number;
      actualOutcome: string;
      source: 'webhook' | 'manual' | 'signal_data' | 'automated';
      timeToOutcomeHours: number;
      actionStatus: 'delivered' | 'read' | 'acknowledged' | 'completed' | 'ignored' | 'unknown';
    }) {
      return closedLoop.recordOutcome(commandId, outcome);
    },

    /**
     * Get closed-loop executor effectiveness stats.
     * Shows how well motor commands achieve their expected outcomes.
     */
    getActionEffectiveness() {
      return closedLoop.computeEffectiveness();
    },

    /**
     * Get feedback signals from motor command outcomes.
     * These indicate which causal edges should be strengthened or weakened.
     */
    getFeedbackSignals() {
      return closedLoop.getFeedbackSignals();
    },

    /**
     * Get overdue motor commands awaiting outcome verification.
     */
    getOverdueCommands() {
      return closedLoop.getOverdueCommands();
    },

    /**
     * Get predictions past their review date that need outcome verification.
     */
    getOverduePredictions() {
      return calibrationLoop.getOverduePredictions();
    },

    /**
     * Get calibration system prompt text for LLM context.
     */
    getCalibrationPrompt() {
      return calibrationLoop.formatCalibrationForPrompt();
    },
};
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type BrainCommanderInstance = ReturnType<typeof createBrainCommander>;

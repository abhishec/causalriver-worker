/**
 * Brain Agent Runtime — Claude Agents Powered by the Full L1-L30 Brain
 * ═══════════════════════════════════════════════════════════════════════
 *
 * THE CRITICAL MISSING PIECE:
 *
 * Before this file, P1 SE-aaS domain actions (code review, incident diagnosis, etc.)
 * bypassed the 30-layer brain stack. They called Claude directly with only L1-L5
 * context injected as text. They never triggered a full L1-L30 cognitive cycle.
 *
 * This runtime fixes that. For EVERY P1 request:
 *
 *   1. Run FULL L1-L30 brain cycle (all 30 layers, no shortcuts)
 *   2. Format ALL 30 layer outputs into Claude's system prompt
 *   3. Call Claude with agent-specific prompt + full brain memory
 *   4. Parse response, compute composite confidence
 *   5. Route: high confidence → auto-execute, low → human approval
 *   6. Record for closed-loop learning (Loop 6)
 *
 * BRAIN AGENT = Claude + Full Brain Memory + Semi-Autonomous Execution
 *
 * Unlike OpenClaw/Manus/Devin agents that are stateless, Brain Agents have
 * organizational memory from all 30 brain layers: causal graphs, entity links,
 * org topology, impact cascades, wisdom principles, and more.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NeuralCortexInstance } from './neural-cortex-controller';
import type { FullCycleResult, DeepPipelineInstance } from './deep-pipeline-connector';
import type {
  CognitiveCycleInput,
  CognitiveSignal,
  CognitiveCausalEdge,
  CognitivePrediction,
  CognitiveMetric,
} from './cognitive-stack';
import type {
  ClosedLoopLearningInstance,
  AgentOutcomeRecord,
} from './closed-loop-learning-engine';
import type { BrainAgentDefinition } from './brain-agent-definitions';
import {
  formatFullBrainContextForAgent,
  buildFullBrainAttribution,
} from './brain-context-for-domains';

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for the Brain Agent Runtime */
export interface BrainAgentRuntimeConfig {
  /** Supabase client for loading brain data */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Neural cortex controller (for runAgentCycle) */
  cortex: NeuralCortexInstance;
  /** Closed-loop learning engine (for outcome tracking) */
  closedLoop?: ClosedLoopLearningInstance;
  /** Default Anthropic API key */
  defaultAnthropicApiKey?: string;
  /** Default Claude model */
  defaultModel?: string;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/** Input to execute a brain agent */
export interface BrainAgentRequest {
  /** Which brain agent to run */
  agentId: string;
  /** Domain-specific input payload */
  input: Record<string, unknown>;
  /** Anthropic API key (overrides default) */
  anthropicApiKey?: string;
  /** Override confidence threshold */
  confidenceThreshold?: number;
  /** Force auto-execute regardless of confidence */
  forceAutoExecute?: boolean;
  /** User ID making the request */
  userId?: string;
  /** User query (for Theory of Mind layer) */
  userQuery?: string;
  /** Existing signals to include (optional — runtime loads its own) */
  existingSignals?: CognitiveSignal[];
}

/** A proposed action that needs human approval */
export interface ProposedAction {
  type: string;
  description: string;
  expectedOutcome: string;
  confidence: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

/** Output from a brain agent execution */
export interface BrainAgentResult {
  /** Unique execution ID */
  executionId: string;
  /** Which agent ran */
  agentId: string;
  /** Execution status */
  status: 'auto-executed' | 'pending-approval' | 'failed';
  /** Claude's parsed response */
  agentOutput: Record<string, unknown>;
  /** Composite confidence score (0-1) */
  confidence: number;
  /** Whether this was auto-executed */
  autoExecuted: boolean;
  /** If pending-approval, proposed actions */
  proposedActions?: ProposedAction[];
  /** Full L1-L30 brain cycle result (for transparency) */
  brainCycleResult: FullCycleResult;
  /** Which layers contributed most */
  layerContributions: Array<{ layerId: number; layerName: string; weight: number }>;
  /** Brain attribution block */
  brainAttribution: Record<string, unknown>;
  /** Performance metrics */
  metrics: {
    brainCycleDurationMs: number;
    claudeCallDurationMs: number;
    totalDurationMs: number;
    tokensUsed: number;
    model: string;
  };
  /** Closed-loop tracking (for outcome verification) */
  closedLoopTrackingId?: string;
  /** Error details (if failed) */
  error?: string;
}

/** The Brain Agent Runtime instance */
export interface BrainAgentRuntimeInstance {
  /** Execute a brain agent: full L1-L30 cycle → Claude → confidence routing */
  execute(request: BrainAgentRequest): Promise<BrainAgentResult>;

  /** Register a brain agent definition */
  registerAgent(definition: BrainAgentDefinition): void;

  /** Get a registered agent definition */
  getAgent(agentId: string): BrainAgentDefinition | undefined;

  /** List all registered agents */
  listAgents(): BrainAgentDefinition[];

  /** Approve a pending action (human-in-the-loop) */
  approveAction(executionId: string, approved: boolean, feedback?: string): Promise<void>;

  /** Get execution history */
  getExecutionHistory(filter?: {
    agentId?: string;
    status?: string;
    limit?: number;
  }): BrainAgentResult[];
}

// ============================================================================
// LAYER NAME LOOKUP
// ============================================================================

const LAYER_NAMES: Record<number, string> = {
  1: 'Episodic Memory', 2: 'LLM Reasoner', 3: 'Deep Dreaming',
  4: 'Hierarchical Memory', 5: 'Curiosity Engine', 6: 'Self-Modifying Cognition',
  7: 'Intelligence Mesh', 8: 'Causal Imagination', 9: 'Theory of Mind',
  10: 'Temporal Consciousness', 11: 'Red Team', 12: 'Experimentation',
  13: 'Immune System', 14: 'Goal-Backward Planning', 15: 'Narrative Intelligence',
  16: 'Domain Hierarchy Learning', 17: 'Cross-System Entity Linker',
  18: 'Organizational Topology', 19: 'Impact Cascade Modeler',
  20: 'Strategic Synthesis', 21: 'Resource Allocation Optimizer',
  22: 'Knowledge Transfer Detector', 23: 'Process Mining',
  24: 'Predictive Staffing', 25: 'Competitive Intelligence',
  26: 'Decision Audit Trail', 27: 'Organizational Learning Rate',
  28: 'Cross-Org Pattern Transfer', 29: 'Intervention Recommender',
  30: 'Wisdom Layer',
};

// ============================================================================
// FACTORY
// ============================================================================

export function createBrainAgentRuntime(config: BrainAgentRuntimeConfig): BrainAgentRuntimeInstance {
  const {
    supabase,
    organizationId,
    cortex,
    closedLoop,
    defaultAnthropicApiKey,
    defaultModel = 'claude-sonnet-4-20250514',
    defaultMaxTokens = 4096,
    verbose = false,
  } = config;

  // ── Internal state ──
  const _agents = new Map<string, BrainAgentDefinition>();
  const _history: BrainAgentResult[] = [];
  const _pendingApprovals = new Map<string, BrainAgentResult>();

  function _log(...args: unknown[]): void {
    if (verbose) console.log('[brain-agent-runtime]', ...args);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: BUILD COGNITIVE CYCLE INPUT FROM SUPABASE
  // ════════════════════════════════════════════════════════════════════════

  async function _buildCycleInput(
    request: BrainAgentRequest
  ): Promise<CognitiveCycleInput> {
    const signals: CognitiveSignal[] = request.existingSignals ?? [];
    const causalEdges: CognitiveCausalEdge[] = [];
    const patterns: string[] = [];
    const predictions: CognitivePrediction[] = [];
    const metrics: CognitiveMetric[] = [];

    // Load recent signals from cross_domain_signals
    if (signals.length === 0) {
      try {
        const { data: rawSignals } = await supabase
          .from('cross_domain_signals')
          .select('id, source, domain, entity_type, entity_id, signal_value, created_at, signal_metadata')
          .eq('organization_id', organizationId)
          .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(500);

        if (rawSignals) {
          for (const s of rawSignals) {
            signals.push({
              id: s.id,
              source: s.source ?? 'unknown',
              domain: s.domain ?? 'unknown',
              entityType: s.entity_type ?? 'unknown',
              entityId: s.entity_id ?? 'unknown',
              value: s.signal_value ?? 0,
              timestamp: new Date(s.created_at).getTime(),
              metadata: s.signal_metadata as Record<string, unknown> | undefined,
            });
          }
        }
      } catch {
        _log('Warning: Failed to load signals from Supabase');
      }
    }

    // Load causal edges
    try {
      const { data: edges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, confidence_level, optimal_lag_days')
        .eq('organization_id', organizationId)
        .order('effect_size', { ascending: false })
        .limit(200);

      if (edges) {
        for (const e of edges) {
          causalEdges.push({
            source: e.source_domain,
            target: e.target_domain,
            weight: e.effect_size ?? 0.5,
            confidence: e.confidence_level ?? 0.5,
            domain: e.source_domain,
          });
        }
      }
    } catch {
      _log('Warning: Failed to load causal edges');
    }

    // Load active patterns
    try {
      const { data: rules } = await supabase
        .from('brain_grammar_rules')
        .select('rule_body')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .limit(100);

      if (rules) {
        for (const r of rules) {
          patterns.push(r.rule_body);
        }
      }
    } catch {
      _log('Warning: Failed to load patterns');
    }

    // Load current predictions
    try {
      const { data: preds } = await supabase
        .from('prediction_records')
        .select('id, domain, predicted_outcome, confidence, evidence, method')
        .eq('organization_id', organizationId)
        .is('was_correct', null)
        .limit(50);

      if (preds) {
        for (const p of preds) {
          predictions.push({
            id: p.id,
            domain: p.domain ?? 'unknown',
            claim: p.predicted_outcome ?? '',
            confidence: p.confidence ?? 0.5,
            evidence: Array.isArray(p.evidence) ? p.evidence : [],
            method: p.method ?? 'unknown',
          });
        }
      }
    } catch {
      _log('Warning: Failed to load predictions');
    }

    return {
      signals,
      causalEdges,
      patterns,
      predictions,
      metrics,
      userId: request.userId,
      userQuery: request.userQuery,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: CALL CLAUDE WITH BRAIN CONTEXT
  // ════════════════════════════════════════════════════════════════════════

  async function _callClaude(
    agent: BrainAgentDefinition,
    brainContext: string,
    inputPayload: string,
    apiKey: string
  ): Promise<{ output: Record<string, unknown>; tokensUsed: number; durationMs: number }> {
    const start = Date.now();
    const model = agent.model ?? defaultModel;
    const maxTokens = agent.maxTokens ?? defaultMaxTokens;
    const temperature = agent.temperature ?? 0.3;

    // Build the prompt from template
    let prompt = agent.systemPromptTemplate;
    prompt = prompt.replace('{{BRAIN_CONTEXT}}', brainContext);
    prompt = prompt.replace('{{INPUT}}', inputPayload);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    // Parse JSON from response
    const output = _parseClaudeResponse(text);

    return { output, tokensUsed, durationMs: Date.now() - start };
  }

  function _parseClaudeResponse(text: string): Record<string, unknown> {
    // Try to extract JSON from ```json blocks
    const jsonBlockMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        // Fall through to next attempt
      }
    }

    // Try to parse the entire response as JSON
    try {
      return JSON.parse(text);
    } catch {
      // Fall through
    }

    // Try to find any JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }

    // Return raw text as a fallback
    return { rawResponse: text, parseError: 'Could not extract JSON from Claude response' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: COMPUTE COMPOSITE CONFIDENCE
  // ════════════════════════════════════════════════════════════════════════

  function _computeCompositeConfidence(
    agentOutput: Record<string, unknown>,
    brainCycleResult: FullCycleResult,
    agentId: string
  ): number {
    // Factor 1: Claude's self-reported confidence (weight: 0.40)
    const claudeConfidence = typeof agentOutput.overallConfidence === 'number'
      ? agentOutput.overallConfidence
      : 0.5;

    // Factor 2: Brain calibration score from L6 (weight: 0.15)
    const calibration = brainCycleResult.brain.selfModel.calibrationScore;

    // Factor 3: Red Team robustness from L11 (weight: 0.20)
    const robustness = brainCycleResult.brain.redTeam.robustnessAvg;

    // Factor 4: Historical agent accuracy from execution history (weight: 0.25)
    const agentHistory = _history.filter(h => h.agentId === agentId && h.status !== 'failed');
    const historyAccuracy = agentHistory.length >= 3
      ? agentHistory
          .slice(-10)
          .reduce((sum, h) => sum + h.confidence, 0) / Math.min(agentHistory.length, 10)
      : 0.5; // Default if insufficient history

    const composite =
      claudeConfidence * 0.40 +
      calibration * 0.15 +
      robustness * 0.20 +
      historyAccuracy * 0.25;

    return Math.max(0, Math.min(1, composite));
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: EXTRACT PROPOSED ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  function _extractProposedActions(
    agentOutput: Record<string, unknown>,
    confidence: number
  ): ProposedAction[] {
    const actions: ProposedAction[] = [];

    // Extract from common output fields
    const recommendations = agentOutput.recommendations as Array<Record<string, unknown>> | undefined;
    const remediationSteps = agentOutput.remediationSteps as Array<Record<string, unknown>> | undefined;
    const optimizations = agentOutput.optimizations as Array<Record<string, unknown>> | undefined;

    const sources = recommendations ?? remediationSteps ?? optimizations ?? [];

    for (const item of sources.slice(0, 5)) {
      const itemConfidence = typeof item.confidence === 'number' ? item.confidence : confidence;
      actions.push({
        type: String(item.action ?? item.step ?? item.type ?? 'recommendation'),
        description: String(item.description ?? item.action ?? item.step ?? ''),
        expectedOutcome: String(item.expectedOutcome ?? item.impact ?? item.expectedImprovement ?? ''),
        confidence: itemConfidence,
        risk: _assessRisk(itemConfidence, item),
      });
    }

    return actions;
  }

  function _assessRisk(
    confidence: number,
    item: Record<string, unknown>
  ): 'low' | 'medium' | 'high' | 'critical' {
    const severity = String(item.severity ?? item.riskLevel ?? '').toLowerCase();
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (confidence >= 0.85) return 'low';
    if (confidence >= 0.7) return 'medium';
    return 'high';
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 6: BUILD LAYER CONTRIBUTIONS
  // ════════════════════════════════════════════════════════════════════════

  function _buildLayerContributions(
    agent: BrainAgentDefinition
  ): Array<{ layerId: number; layerName: string; weight: number }> {
    const contributions: Array<{ layerId: number; layerName: string; weight: number }> = [];
    for (const [layerIdStr, weight] of Object.entries(agent.layerWeights)) {
      const layerId = Number(layerIdStr);
      if (weight && weight > 0) {
        contributions.push({
          layerId,
          layerName: LAYER_NAMES[layerId] ?? `Layer ${layerId}`,
          weight,
        });
      }
    }
    return contributions.sort((a, b) => b.weight - a.weight);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════════

  return {
    async execute(request: BrainAgentRequest): Promise<BrainAgentResult> {
      const totalStart = Date.now();
      const executionId = `bae_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 7)}`;

      // ── Validate ──
      const agent = _agents.get(request.agentId);
      if (!agent) {
        return {
          executionId,
          agentId: request.agentId,
          status: 'failed',
          agentOutput: {},
          confidence: 0,
          autoExecuted: false,
          brainCycleResult: null as any,
          layerContributions: [],
          brainAttribution: { brainAugmented: false },
          metrics: { brainCycleDurationMs: 0, claudeCallDurationMs: 0, totalDurationMs: 0, tokensUsed: 0, model: '' },
          error: `Agent "${request.agentId}" not registered. Available: ${[..._agents.keys()].join(', ')}`,
        };
      }

      const apiKey = request.anthropicApiKey ?? defaultAnthropicApiKey;
      if (!apiKey) {
        return {
          executionId,
          agentId: request.agentId,
          status: 'failed',
          agentOutput: {},
          confidence: 0,
          autoExecuted: false,
          brainCycleResult: null as any,
          layerContributions: [],
          brainAttribution: { brainAugmented: false },
          metrics: { brainCycleDurationMs: 0, claudeCallDurationMs: 0, totalDurationMs: 0, tokensUsed: 0, model: '' },
          error: 'No Anthropic API key provided',
        };
      }

      try {
        // ── Step 1: Build cycle input from Supabase ──
        _log(`[${request.agentId}] Building cognitive cycle input...`);
        const cycleInput = await _buildCycleInput(request);
        _log(`[${request.agentId}] Loaded ${cycleInput.signals.length} signals, ${cycleInput.causalEdges.length} edges`);

        // ── Step 2: Run FULL L1-L30 brain cycle ──
        _log(`[${request.agentId}] Running full L1-L30 brain cycle...`);
        const brainStart = Date.now();
        const brainCycleResult = await cortex.runAgentCycle(cycleInput, `brain-agent-${request.agentId}`);
        const brainCycleDurationMs = Date.now() - brainStart;
        _log(`[${request.agentId}] Brain cycle completed in ${brainCycleDurationMs}ms`);

        // ── Step 3: Format brain context for Claude ──
        const brainContext = formatFullBrainContextForAgent(
          brainCycleResult,
          agent.layerWeights,
          agent.id
        );

        // Format user input as string
        const inputPayload = typeof request.input === 'string'
          ? request.input
          : JSON.stringify(request.input, null, 2);

        // ── Step 4: Call Claude with brain context ──
        _log(`[${request.agentId}] Calling Claude (${agent.model ?? defaultModel})...`);
        const claudeResult = await _callClaude(agent, brainContext, inputPayload, apiKey);
        _log(`[${request.agentId}] Claude responded in ${claudeResult.durationMs}ms (${claudeResult.tokensUsed} tokens)`);

        // ── Step 5: Compute composite confidence ──
        const confidence = _computeCompositeConfidence(
          claudeResult.output,
          brainCycleResult,
          request.agentId
        );
        _log(`[${request.agentId}] Composite confidence: ${(confidence * 100).toFixed(1)}%`);

        // ── Step 6: Route based on confidence ──
        const threshold = request.confidenceThreshold ?? agent.confidenceThreshold;
        const autoExecute = request.forceAutoExecute || confidence >= threshold;

        const layerContributions = _buildLayerContributions(agent);
        const proposedActions = autoExecute ? undefined : _extractProposedActions(claudeResult.output, confidence);

        const result: BrainAgentResult = {
          executionId,
          agentId: request.agentId,
          status: autoExecute ? 'auto-executed' : 'pending-approval',
          agentOutput: claudeResult.output,
          confidence,
          autoExecuted: autoExecute,
          proposedActions,
          brainCycleResult,
          layerContributions,
          brainAttribution: buildFullBrainAttribution(brainCycleResult, agent.id, agent.layerWeights),
          metrics: {
            brainCycleDurationMs,
            claudeCallDurationMs: claudeResult.durationMs,
            totalDurationMs: Date.now() - totalStart,
            tokensUsed: claudeResult.tokensUsed,
            model: agent.model ?? defaultModel,
          },
        };

        // ── Step 7: Record for closed-loop learning ──
        if (closedLoop) {
          const outcomeRecord: AgentOutcomeRecord = {
            executionId,
            agentId: request.agentId,
            organizationId,
            timestamp: new Date().toISOString(),
            prediction: JSON.stringify(claudeResult.output).slice(0, 500),
            confidence,
            wasFollowed: autoExecute,
            layerContributions: layerContributions.map(lc => ({
              layerId: lc.layerId,
              weight: lc.weight,
            })),
            verifyAfterMs: 7 * 86400_000, // Verify outcome after 7 days
          };
          closedLoop.recordAgentExecution(outcomeRecord);
          result.closedLoopTrackingId = executionId;
        }

        // ── Track in history and pending approvals ──
        _history.push(result);
        if (result.status === 'pending-approval') {
          _pendingApprovals.set(executionId, result);
        }

        // Keep history bounded
        if (_history.length > 1000) {
          _history.splice(0, _history.length - 500);
        }

        _log(`[${request.agentId}] Execution complete: ${result.status} (confidence: ${(confidence * 100).toFixed(1)}%, threshold: ${(threshold * 100).toFixed(1)}%)`);
        return result;

      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        _log(`[${request.agentId}] FAILED: ${error}`);

        const result: BrainAgentResult = {
          executionId,
          agentId: request.agentId,
          status: 'failed',
          agentOutput: {},
          confidence: 0,
          autoExecuted: false,
          brainCycleResult: null as any,
          layerContributions: [],
          brainAttribution: { brainAugmented: false, error },
          metrics: {
            brainCycleDurationMs: 0,
            claudeCallDurationMs: 0,
            totalDurationMs: Date.now() - totalStart,
            tokensUsed: 0,
            model: '',
          },
          error,
        };

        _history.push(result);
        return result;
      }
    },

    registerAgent(definition: BrainAgentDefinition): void {
      _agents.set(definition.id, definition);
      _log(`Registered brain agent: ${definition.id} (${definition.name})`);
    },

    getAgent(agentId: string): BrainAgentDefinition | undefined {
      return _agents.get(agentId);
    },

    listAgents(): BrainAgentDefinition[] {
      return [..._agents.values()];
    },

    async approveAction(executionId: string, approved: boolean, feedback?: string): Promise<void> {
      const pending = _pendingApprovals.get(executionId);
      if (!pending) {
        _log(`No pending approval found for ${executionId}`);
        return;
      }

      // Update status
      pending.status = approved ? 'auto-executed' : 'failed';
      pending.autoExecuted = approved;
      _pendingApprovals.delete(executionId);

      // Record in closed-loop learning
      if (closedLoop) {
        closedLoop.recordAgentApproval(executionId, approved, feedback);
      }

      _log(`Action ${executionId} ${approved ? 'approved' : 'rejected'}${feedback ? `: ${feedback}` : ''}`);
    },

    getExecutionHistory(filter?: {
      agentId?: string;
      status?: string;
      limit?: number;
    }): BrainAgentResult[] {
      let results = _history;

      if (filter?.agentId) {
        results = results.filter(r => r.agentId === filter.agentId);
      }
      if (filter?.status) {
        results = results.filter(r => r.status === filter.status);
      }

      const limit = filter?.limit ?? 50;
      return results.slice(-limit);
    },
  };
}

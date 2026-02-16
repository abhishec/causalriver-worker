#!/usr/bin/env tsx
/**
 * Nexus Intelligence Programmatic Client — 30-Layer Edition
 * ===========================================================
 *
 * Connects to Demo Org (00000000-0000-4000-b000-000000000001).
 * Ingests ~1M lines of code through GitHub connectors, flows data
 * through all 30 cognitive layers with reinforcement learning,
 * and produces a comprehensive per-layer percolation report.
 *
 * PIPELINE:
 *   GitHub Connector → L1 Ingestion → L2 Entity Resolution →
 *   L3 Deep Dreaming → L4 Hierarchical Memory → L5 Curiosity →
 *   L6 Self-Cognition → L7 Intelligence Mesh → L8 Causal Imagination →
 *   L9 Theory of Mind → L10 Temporal Consciousness → L11 Red Team →
 *   L12 Experimentation → L13 Immune System → L14 Goal Planning →
 *   L15 Narrative → L16 Domain Hierarchy → L17 Entity Linker →
 *   L18 Org Topology → L19 Impact Cascade → L20 Strategic Synthesis →
 *   L21 Resource Allocation → L22 Knowledge Transfer → L23 Process Mining →
 *   L24 Predictive Staffing → L25 Competitive Intel → L26 Decision Audit →
 *   L27 Learning Rate → L28 Cross-Org Transfer → L29 Intervention →
 *   L30 Wisdom → RL Feedback Loop → Brain Evolution
 *
 * USAGE:
 *   npx tsx scripts/nexus-intelligence-client.ts
 *
 * @packageDocumentation
 */

import { config as loadEnv } from 'dotenv';
loadEnv(); // Load .env from project root

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../packages/memory-stack/src/persistence/supabase-repository';
import { createConsolidationEngine } from '../packages/memory-stack/src/orchestrator/consolidation-engine';
import { createGitHubConnector } from '../packages/memory-stack/src/connectors/github';
import {
  runEarlyWarningSystem,
  getEarlyWarningSummary,
} from '../packages/memory-stack/src/orchestrator/early-warning-system';
import { createBrainRunReporter, type BrainRunReport } from '../packages/memory-stack/src/observability/brain-run-reporter';
import { createReinforcementFeedbackSystem, type ReinforcementCycleResult } from '../packages/memory-stack/src/orchestrator/reinforcement-feedback-system';
import { createDeepLayers, type DeepCycleResult, type DeepLayerHealthReport } from '../packages/memory-stack/src/causality/leap-deep-layers';
import { createDomainTaxonomy } from '../packages/memory-stack/src/domain-hierarchy/domain-taxonomy';
import { createCrossSystemEntityGraph } from '../packages/memory-stack/src/domain-hierarchy/cross-system-entity-graph';
import { getDefaultLogger } from '../packages/memory-stack/src/observability';

const logger = getDefaultLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';
const DEMO_ORG_NAME = 'Competition Demo 2026';

/** All 30 layers with metadata — maps to BOTH primary data table AND observability table */
const LAYER_REGISTRY: Array<{
  id: number;
  name: string;
  region: string;
  cognitiveAnalog: string;
  /** Primary data table where this layer's output lives */
  dataTable: string;
  /** Observability/execution tracking table */
  obsTable: string;
  /** Optional filter column for shared tables (e.g., cognitive_layer = 'L3') */
  dataFilter?: { column: string; value: string };
}> = [
  { id: 1,  name: 'Signal Ingestion',        region: 'Brainstem',        cognitiveAnalog: 'Sensory Cortex',               dataTable: 'cross_domain_signals',              obsTable: 'obs_signal_ingestion' },
  { id: 2,  name: 'Entity Resolution',       region: 'Brainstem',        cognitiveAnalog: 'Primary Sensory Association',  dataTable: 'resolved_entities',                 obsTable: 'obs_entity_resolution' },
  { id: 3,  name: 'Semantic Memory',          region: 'Limbic',           cognitiveAnalog: 'Default Mode Network',         dataTable: 'ai_memory',                         obsTable: 'obs_deep_dreaming' },
  { id: 4,  name: 'Causal Graph Engine',     region: 'Limbic',           cognitiveAnalog: 'Hippocampus',                  dataTable: 'causal_relationships_statistical',  obsTable: 'obs_hierarchical_memory' },
  { id: 5,  name: 'Pattern Memory',          region: 'Limbic',           cognitiveAnalog: 'Intrinsic Motivation',         dataTable: 'brain_grammar_rules',               obsTable: 'obs_curiosity_engine' },
  { id: 6,  name: 'Self-Modifying Cognition',region: 'Limbic',           cognitiveAnalog: 'Medial PFC',                   dataTable: 'ai_agent_activity',                 obsTable: 'obs_self_modifying_cognition' },
  { id: 7,  name: 'Connector Sync',          region: 'Limbic',           cognitiveAnalog: 'Corpus Callosum',              dataTable: 'connector_sync_log',                obsTable: 'obs_intelligence_mesh' },
  { id: 8,  name: 'Deep Dreaming',           region: 'Neocortex',        cognitiveAnalog: 'Creative Cognition',           dataTable: 'obs_deep_dreaming',                 obsTable: 'obs_deep_dreaming' },
  { id: 9,  name: 'Hierarchical Memory',     region: 'Neocortex',        cognitiveAnalog: 'Temporo-parietal Junction',    dataTable: 'obs_hierarchical_memory',            obsTable: 'obs_hierarchical_memory' },
  { id: 10, name: 'Curiosity Engine',        region: 'Neocortex',        cognitiveAnalog: 'Predictive Cortex',            dataTable: 'obs_curiosity_engine',               obsTable: 'obs_curiosity_engine' },
  { id: 11, name: 'Red Team',                region: 'Neocortex',        cognitiveAnalog: 'Amygdala + Insula',            dataTable: 'obs_agent_executions',               obsTable: 'obs_agent_executions', dataFilter: { column: 'layer_id', value: 'L11' } },
  { id: 12, name: 'Experimentation',         region: 'Neocortex',        cognitiveAnalog: 'Scientific Method / PFC',      dataTable: 'obs_agent_executions',               obsTable: 'obs_agent_executions', dataFilter: { column: 'layer_id', value: 'L12' } },
  { id: 13, name: 'Immune System',           region: 'Neocortex',        cognitiveAnalog: 'Pattern Recognition Immunity', dataTable: 'obs_signal_ingestion',               obsTable: 'obs_signal_ingestion' },
  { id: 14, name: 'Goal-Backward Planning',  region: 'Neocortex',        cognitiveAnalog: 'Lateral PFC (planning)',       dataTable: 'obs_agent_executions',               obsTable: 'obs_agent_executions', dataFilter: { column: 'layer_id', value: 'L14' } },
  { id: 15, name: 'Narrative Intelligence',  region: 'Neocortex',        cognitiveAnalog: "Broca's / Wernicke's Area",    dataTable: 'obs_agent_executions',               obsTable: 'obs_agent_executions', dataFilter: { column: 'layer_id', value: 'L15' } },
  { id: 16, name: 'Domain Hierarchy',        region: 'Soma',             cognitiveAnalog: 'Cerebral Organization',        dataTable: 'domain_taxonomy_state',              obsTable: 'obs_layer_health' },
  { id: 17, name: 'Cross-System Entity Linker', region: 'Soma',          cognitiveAnalog: 'Graph Perception',             dataTable: 'entity_graph_nodes',                obsTable: 'obs_layer_health' },
  { id: 18, name: 'Organizational Topology', region: 'Soma',             cognitiveAnalog: 'Social Topology',              dataTable: 'obs_layer_health',                  obsTable: 'obs_layer_health' },
  { id: 19, name: 'Impact Cascade Modeler',  region: 'Cortex',           cognitiveAnalog: 'Association Cortex',           dataTable: 'obs_feedback_loops',                obsTable: 'obs_feedback_loops' },
  { id: 20, name: 'Strategic Synthesis',     region: 'Cortex',           cognitiveAnalog: 'Lateral PFC (synthesis)',       dataTable: 'obs_consolidation_cycles',           obsTable: 'obs_consolidation_cycles' },
  { id: 21, name: 'Resource Allocation',     region: 'Cortex',           cognitiveAnalog: 'Dorsolateral PFC',             dataTable: 'obs_layer_health',                  obsTable: 'obs_layer_health' },
  { id: 22, name: 'Knowledge Transfer',      region: 'Cerebellum',       cognitiveAnalog: 'Motor Coordination Analog',    dataTable: 'obs_layer_health',                  obsTable: 'obs_layer_health' },
  { id: 23, name: 'Process Mining',          region: 'Cerebellum',       cognitiveAnalog: 'Sequential Pattern Recognition',dataTable: 'obs_consolidation_cycles',          obsTable: 'obs_consolidation_cycles' },
  { id: 24, name: 'Predictive Staffing',     region: 'Cerebellum',       cognitiveAnalog: 'Predictive Coding',            dataTable: 'brain_intelligence_snapshots',       obsTable: 'obs_layer_health' },
  { id: 25, name: 'Competitive Intelligence',region: 'Prefrontal',       cognitiveAnalog: 'External Attention',           dataTable: 'obs_feedback_loops',                obsTable: 'obs_feedback_loops' },
  { id: 26, name: 'Decision Audit Trail',    region: 'Prefrontal',       cognitiveAnalog: 'Self-Referential PFC',         dataTable: 'prediction_records',                obsTable: 'obs_consolidation_cycles' },
  { id: 27, name: 'Org Learning Rate',       region: 'Prefrontal',       cognitiveAnalog: 'Meta-Learning',                dataTable: 'brain_evolution_snapshots',          obsTable: 'obs_consolidation_cycles' },
  { id: 28, name: 'Cross-Org Transfer',      region: 'Corpus Callosum',  cognitiveAnalog: 'Inter-Brain Federation',       dataTable: 'obs_intelligence_mesh',              obsTable: 'obs_connector_operations' },
  { id: 29, name: 'Intervention Recommender',region: 'Corpus Callosum',  cognitiveAnalog: 'Integration Cortex',           dataTable: 'brain_feedback_queue',               obsTable: 'obs_agent_executions' },
  { id: 30, name: 'Wisdom Layer',            region: 'Corpus Callosum',  cognitiveAnalog: 'Autobiographical Memory',      dataTable: 'brain_intelligence_snapshots',       obsTable: 'obs_consolidation_cycles' },
];

// ============================================================================
// TYPES
// ============================================================================

export interface NexusIntelligenceConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  organizationId?: string;
  anthropicApiKey?: string;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  platformUrl?: string;
}

/** Per-layer status in the percolation report */
export interface LayerPercolationRow {
  layerId: number;
  layerName: string;
  region: string;
  cognitiveAnalog: string;
  hasData: boolean;
  recordCount: number;
  latestTimestamp: string | null;
  healthStatus: 'healthy' | 'degraded' | 'failing' | 'empty';
  avgLatencyMs: number | null;
  errorCount: number;
  /** RL scheduling multiplier (1.0 = normal) */
  rlSchedulingMultiplier: number;
  /** RL compute budget (1.0 = normal) */
  rlComputeBudget: number;
  /** RL exploration rate */
  rlExplorationRate: number;
  /** Key metrics produced by this layer */
  keyMetrics: Record<string, number | string>;
}

/** Codebase analysis report */
export interface CodebaseReport {
  summary: {
    totalRepos: number;
    totalPRs: number;
    totalCommits: number;
    totalReviews: number;
    totalIssues: number;
    totalSignals: number;
    uniqueAuthors: number;
    uniqueReviewers: number;
    languages: Record<string, number>;
    avgPRCycleTimeHours: number;
    avgPRSize: number;
  };
  structure: {
    fileTypes: Record<string, number>;
    topDirectories: Array<{ path: string; fileCount: number }>;
    repoBreakdown: Array<{
      name: string;
      stars: number;
      language: string;
      prCount: number;
      commitCount: number;
      issueCount: number;
    }>;
  };
  complexity: {
    velocityTrend: 'accelerating' | 'stable' | 'decelerating' | 'collapsing';
    currentVelocity: number;
    bottleneckRiskLevel: string;
    topBottleneck: string;
    reviewConcentration: number;
    cycleTimeVariance: number;
  };
  health: {
    brainIntelligenceScore: number;
    brainAccuracy: number;
    brainBrierScore: number;
    causalRelationshipsDiscovered: number;
    patternsLearned: number;
    predictionsVerified: number;
  };
}

/** Full report combining everything */
export interface FullIngestionReport {
  organization: { id: string; name: string };
  ingestion: {
    duration_ms: number;
    signalsIngested: number;
    connectorsUsed: string[];
  };
  codebase: CodebaseReport;
  layerPercolation: LayerPercolationRow[];
  brainRunReport: BrainRunReport | null;
  deepCycleResult: DeepCycleResult | null;
  deepLayerHealth: DeepLayerHealthReport | null;
  reinforcementLearning: {
    globalReward: number;
    signals: Array<{ layer: number; type: string; strength: number; reason: string }>;
    schedulingAdjustments: Array<{ layer: number; old: number; new_: number; reason: string }>;
  } | null;
  earlyWarning: {
    overallRisk: number;
    riskLevel: string;
    bottlenecks: number;
    velocityAtRisk: boolean;
  } | null;
  evolution: {
    intelligenceScore: number;
    accuracy: number;
    brierScore: number;
    totalEdges: number;
    learningVelocity: number;
  } | null;
}

// ============================================================================
// MAIN CLIENT CLASS
// ============================================================================

export class NexusIntelligenceClient {
  private supabase: SupabaseClient;
  private orgId: string;
  private config: NexusIntelligenceConfig & { organizationId: string };
  private repository: ReturnType<typeof createSupabaseRepository>;

  constructor(supabase: SupabaseClient, config: NexusIntelligenceConfig & { organizationId: string }) {
    this.supabase = supabase;
    this.orgId = config.organizationId;
    this.config = config;
    this.repository = createSupabaseRepository(supabase, config.organizationId);
  }

  // ==========================================================================
  // STEP 1: ENSURE ORG
  // ==========================================================================

  async ensureOrganization(): Promise<void> {
    const { data: existing } = await this.supabase
      .from('organizations')
      .select('id')
      .eq('id', this.orgId)
      .single();

    if (existing) {
      logger.info(`Organization exists: ${this.orgId}`);
      return;
    }

    const { error } = await this.supabase.from('organizations').insert({
      id: this.orgId,
      name: DEMO_ORG_NAME,
      slug: 'competition-demo-2026',
      created_at: new Date().toISOString(),
    });

    if (error) throw new Error(`Failed to create org: ${error.message}`);
    logger.info(`Created organization: ${DEMO_ORG_NAME}`);
  }

  // ==========================================================================
  // STEP 2: INGEST CODE FROM GITHUB (Connector → L1)
  // ==========================================================================

  async ingestFromGitHub(repos?: Array<{ owner: string; repo: string }>): Promise<{
    totalSignals: number;
    repoResults: Array<{ repo: string; signals: number; duration_ms: number }>;
  }> {
    if (!this.config.githubToken) {
      throw new Error('GitHub token required. Set GITHUB_TOKEN env var.');
    }

    const repoList = repos || [{
      owner: this.config.githubOwner || 'demo',
      repo: this.config.githubRepo || 'demo',
    }];

    const repoResults: Array<{ repo: string; signals: number; duration_ms: number }> = [];
    let totalSignals = 0;

    for (const { owner, repo } of repoList) {
      logger.info(`Ingesting ${owner}/${repo}...`);

      const connector = createGitHubConnector({
        token: this.config.githubToken!,
        owner,
        repo,
      });

      const result = await connector.fullSync(this.supabase, this.orgId);
      totalSignals += result.signalsGenerated;
      repoResults.push({
        repo: `${owner}/${repo}`,
        signals: result.signalsGenerated,
        duration_ms: result.duration_ms,
      });

      logger.info(`  ${owner}/${repo}: ${result.signalsGenerated} signals in ${result.duration_ms}ms`);
    }

    logger.info(`Total ingested: ${totalSignals} signals from ${repoList.length} repos`);
    return { totalSignals, repoResults };
  }

  // ==========================================================================
  // STEP 3: RUN BRAIN CONSOLIDATION (L1-L15 + Causal Discovery)
  // ==========================================================================

  async runConsolidation(options?: {
    lookbackHours?: number;
    discoveryLookbackDays?: number;
    verbose?: boolean;
  }): Promise<{
    status: string;
    signalsProcessed: number;
    causalEdgesDiscovered: number;
    newRelationships: number;
    patternsFound: number;
    durationMs: number;
    steps: Array<{ step: string; status: string; durationMs: number }>;
  }> {
    logger.info('Running brain consolidation (L1-L15 causal discovery)...');

    const engine = createConsolidationEngine({
      supabase: this.supabase,
      organizationId: this.orgId,
      lookbackHours: options?.lookbackHours ?? 720, // 30 days
      discoveryLookbackDays: options?.discoveryLookbackDays ?? 180,
      verbose: options?.verbose ?? true,
    });

    const result = await engine.runConsolidation();

    return {
      status: result.status,
      signalsProcessed: result.report.stats.signalsProcessed,
      causalEdgesDiscovered: result.report.stats.causalEdgesDiscovered,
      newRelationships: result.report.stats.newRelationships,
      patternsFound: result.report.stats.patternsFound,
      durationMs: result.totalDurationMs,
      steps: result.steps.map(s => ({
        step: s.step,
        status: s.status,
        durationMs: s.durationMs,
      })),
    };
  }

  // ==========================================================================
  // STEP 4: RUN DEEP LAYERS (L16-L30)
  // ==========================================================================

  async runDeepLayers(): Promise<DeepCycleResult | null> {
    logger.info('Running deep layers (L16-L30)...');

    try {
      const domainTaxonomy = createDomainTaxonomy();
      const entityGraph = createCrossSystemEntityGraph();

      const deepLayers = createDeepLayers({
        organizationId: this.orgId,
        domainTaxonomy,
        entityGraph,
      });

      // Gather inputs for deep cycle from L1-L15 outputs
      const [signals, edges, patternsData] = await Promise.all([
        this.supabase
          .from('cross_domain_signals')
          .select('source_domain, signal_type, signal_value, entity_id, created_at, signal_metadata')
          .eq('organization_id', this.orgId)
          .order('created_at', { ascending: false })
          .limit(5000),
        this.supabase
          .from('causal_relationships_statistical')
          .select('source_domain, target_domain, effect_size, evidence_weight')
          .eq('organization_id', this.orgId)
          .eq('is_significant', true),
        this.supabase
          .from('brain_grammar_rules')
          .select('*')
          .eq('organization_id', this.orgId)
          .eq('is_active', true)
          .limit(100),
      ]);

      // Build domain signals map
      const domainSignals = new Map<string, Array<{
        signalType: string;
        value: number;
        entityId: string;
        timestamp: number;
        metadata?: Record<string, unknown>;
      }>>();
      for (const sig of signals.data || []) {
        const domain = sig.source_domain || 'unknown';
        if (!domainSignals.has(domain)) domainSignals.set(domain, []);
        domainSignals.get(domain)!.push({
          signalType: sig.signal_type,
          value: sig.signal_value,
          entityId: sig.entity_id || 'unknown',
          timestamp: new Date(sig.created_at).getTime(),
          metadata: sig.signal_metadata as Record<string, unknown> | undefined,
        });
      }

      const causalEdges = (edges.data || []).map((e: any) => ({
        source: e.source_domain,
        target: e.target_domain,
        weight: e.effect_size || 0,
        confidence: e.evidence_weight || 0.5,
      }));

      const deepResult = deepLayers.runDeepCycle({
        cognitiveCycleOutputs: {
          immune: { signalsPassed: signals.data?.length || 0, avgQuality: 0.8 },
          dreaming: { associationsFound: 0, surfacedInsights: 0, crossDomainConnections: 0 },
          curiosity: { hypothesesGenerated: 0, knowledgeGaps: 0 },
          temporal: { rhythmsDetected: 0, goalsTracked: 0 },
          narrative: null,
          planning: { goalsPlanned: 0, feasiblePaths: 0, topRecommendation: '' },
        },
        causalEdges,
        domainSignals,
        metrics: [],
      });

      logger.info(`Deep layers complete in ${deepResult.durationMs}ms`);
      return deepResult;

    } catch (err: any) {
      logger.warn(`Deep layers failed (non-fatal): ${err.message}`);
      return null;
    }
  }

  // ==========================================================================
  // STEP 5: RUN REINFORCEMENT LEARNING CYCLE
  // ==========================================================================

  async runReinforcementCycle(): Promise<ReinforcementCycleResult | null> {
    logger.info('Running reinforcement learning cycle (30 layers)...');

    try {
      const rl = createReinforcementFeedbackSystem({
        supabase: this.supabase,
        organizationId: this.orgId,
        learningRate: 0.1,
        discountFactor: 0.95,
        initialExplorationRate: 0.3,
        explorationDecay: 0.995,
      });

      // Gather per-layer metrics from observation tables
      const layerMetrics = new Map<number, Record<string, number>>();

      // L1: signal ingestion
      const { count: signalCount } = await this.supabase
        .from('cross_domain_signals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId);
      layerMetrics.set(1, { signalsPassed: signalCount || 0, avgQuality: 0.8 });

      // L2: entity resolution
      const { count: entityCount } = await this.supabase
        .from('resolved_entities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId);
      layerMetrics.set(2, { edgesDiscovered: entityCount || 0, robustness: 0.9 });

      // L4: causal edges
      const { count: edgeCount } = await this.supabase
        .from('causal_relationships_statistical')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId)
        .eq('is_significant', true);
      layerMetrics.set(4, { encoded: edgeCount || 0, episodes: 0 });

      // L5: patterns
      const { count: patternCount } = await this.supabase
        .from('brain_grammar_rules')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId)
        .eq('is_active', true);
      layerMetrics.set(5, { hypotheses: patternCount || 0, gaps: 0 });

      // Fill remaining layers with defaults so RL processes all 30
      for (let l = 1; l <= 30; l++) {
        if (!layerMetrics.has(l)) {
          layerMetrics.set(l, { output: 0 });
        }
      }

      const result = rl.processCycleRewards(layerMetrics);
      logger.info(`RL cycle: globalReward=${result.globalReward.toFixed(3)}, signals=${result.signals.length}`);
      return result;

    } catch (err: any) {
      logger.warn(`RL cycle failed (non-fatal): ${err.message}`);
      return null;
    }
  }

  // ==========================================================================
  // STEP 6: GENERATE PER-LAYER PERCOLATION REPORT
  // ==========================================================================

  async generateLayerPercolationTable(
    rlResult?: ReinforcementCycleResult | null,
  ): Promise<LayerPercolationRow[]> {
    logger.info('Generating per-layer percolation report...');

    const rows: LayerPercolationRow[] = [];

    // Get brain run report for layer-level detail
    let brainReport: BrainRunReport | null = null;
    try {
      const reporter = createBrainRunReporter({
        supabase: this.supabase,
        organizationId: this.orgId,
      });
      brainReport = await reporter.generateRunReport({ hours: 720 }); // 30 days
    } catch {
      logger.warn('Brain run reporter unavailable, using direct queries');
    }

    // RL state map
    const rlStates = new Map<number, {
      scheduling: number;
      compute: number;
      exploration: number;
    }>();
    if (rlResult) {
      // Use RL system to get scheduling multipliers
      const rl = createReinforcementFeedbackSystem();
      for (let l = 1; l <= 30; l++) {
        rlStates.set(l, {
          scheduling: rl.getSchedulingMultiplier(l),
          compute: rl.getComputeBudget(l),
          exploration: rl.getLayerState(l)?.explorationRate ?? 0.3,
        });
      }
    }

    for (const layer of LAYER_REGISTRY) {
      // Brain report provides latency/health metadata
      const brainLayer = brainReport?.layers?.find(
        (bl) => bl.layer_number === layer.id,
      );

      // ALWAYS query the PRIMARY data table for accurate record counts
      let recordCount = 0;
      let latestTimestamp = brainLayer?.latest_timestamp ?? null;
      let healthStatus: 'healthy' | 'degraded' | 'failing' | 'empty' = 'empty';
      let avgLatencyMs = brainLayer?.avg_latency_ms ?? null;
      let errorCount = brainLayer?.failure_count ?? 0;

      try {
        let query = this.supabase
          .from(layer.dataTable)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', this.orgId);

        // Apply layer-specific filter for shared tables
        if (layer.dataFilter) {
          query = query.eq(layer.dataFilter.column, layer.dataFilter.value);
        }

        const { count } = await query;
        recordCount = count || 0;
      } catch {
        // Table might not exist yet — try obsTable as fallback
        try {
          const { count } = await this.supabase
            .from(layer.obsTable)
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.orgId);
          recordCount = count || 0;
        } catch {
          recordCount = 0;
        }
      }

      // Determine health from record count and brain report
      if (recordCount > 0) {
        healthStatus = brainLayer?.health_status === 'degraded' ? 'degraded'
          : brainLayer?.health_status === 'failing' ? 'failing'
          : 'healthy';
      } else {
        healthStatus = 'empty';
      }

      const rlState = rlStates.get(layer.id) || {
        scheduling: 1.0,
        compute: 1.0,
        exploration: 0.3,
      };

      // Build key metrics per layer
      const keyMetrics: Record<string, number | string> = {};

      switch (layer.id) {
        case 1: {
          const { count } = await this.supabase
            .from('cross_domain_signals')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.orgId);
          keyMetrics['signals_total'] = count || 0;

          const { data: domains } = await this.supabase
            .from('cross_domain_signals')
            .select('source_domain')
            .eq('organization_id', this.orgId)
            .limit(10000);
          const domainSet = new Set((domains || []).map((d: any) => d.source_domain));
          keyMetrics['domains_active'] = domainSet.size;
          break;
        }
        case 2: {
          const { count } = await this.supabase
            .from('resolved_entities')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.orgId);
          keyMetrics['entities_resolved'] = count || 0;
          break;
        }
        case 4: {
          const { count } = await this.supabase
            .from('causal_relationships_statistical')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.orgId)
            .eq('is_significant', true);
          keyMetrics['causal_edges'] = count || 0;

          const { data: topEdge } = await this.supabase
            .from('causal_relationships_statistical')
            .select('source_domain, target_domain, effect_size')
            .eq('organization_id', this.orgId)
            .eq('is_significant', true)
            .order('effect_size', { ascending: false })
            .limit(1);
          if (topEdge?.[0]) {
            keyMetrics['strongest_edge'] = `${topEdge[0].source_domain} → ${topEdge[0].target_domain} (${topEdge[0].effect_size?.toFixed(2)})`;
          }
          break;
        }
        case 5: {
          const { count } = await this.supabase
            .from('brain_grammar_rules')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.orgId)
            .eq('is_active', true);
          keyMetrics['active_patterns'] = count || 0;
          break;
        }
        default:
          keyMetrics['status'] = recordCount > 0 ? 'populated' : 'awaiting_data';
      }

      rows.push({
        layerId: layer.id,
        layerName: layer.name,
        region: layer.region,
        cognitiveAnalog: layer.cognitiveAnalog,
        hasData: recordCount > 0,
        recordCount,
        latestTimestamp,
        healthStatus,
        avgLatencyMs,
        errorCount,
        rlSchedulingMultiplier: Math.round(rlState.scheduling * 100) / 100,
        rlComputeBudget: Math.round(rlState.compute * 100) / 100,
        rlExplorationRate: Math.round(rlState.exploration * 1000) / 1000,
        keyMetrics,
      });
    }

    return rows;
  }

  // ==========================================================================
  // STEP 7: GENERATE CODEBASE ANALYSIS REPORT
  // ==========================================================================

  async generateCodebaseReport(): Promise<CodebaseReport> {
    logger.info('Generating codebase analysis report...');

    // Fetch all signal data for analysis
    const [signalStats, prData, reviewData, commitData, issueData, evolutionData, edgeData, patternData] = await Promise.all([
      // Total signals
      this.supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value, entity_id, entity_type, created_at')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(50000),
      // PRs
      this.supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, entity_id, signal_metadata, created_at')
        .eq('organization_id', this.orgId)
        .eq('source_domain', 'engineering')
        .in('signal_type', ['pr_opened', 'pr_merged', 'pr_cycle_time', 'pr_size', 'pr_closed'])
        .limit(10000),
      // Reviews
      this.supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, entity_id, signal_metadata, created_at')
        .eq('organization_id', this.orgId)
        .in('signal_type', ['pr_review_approved', 'pr_review_changes_requested', 'pr_review_commented', 'pr_review'])
        .limit(10000),
      // Commits
      this.supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, entity_id, created_at')
        .eq('organization_id', this.orgId)
        .in('signal_type', ['commit_velocity', 'commit', 'commit_count'])
        .limit(5000),
      // Issues
      this.supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, entity_id, created_at')
        .eq('organization_id', this.orgId)
        .in('signal_type', ['issue_open', 'issue_opened', 'issue_closed', 'bug_reported'])
        .limit(5000),
      // Evolution
      this.supabase
        .from('brain_evolution_snapshots')
        .select('intelligence_score, accuracy, brier_score, total_edges, learning_velocity_score')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(1),
      // Edges
      this.supabase
        .from('causal_relationships_statistical')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId)
        .eq('is_significant', true),
      // Patterns
      this.supabase
        .from('brain_grammar_rules')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.orgId)
        .eq('is_active', true),
    ]);

    const allSignals = signalStats.data || [];
    const prs = prData.data || [];
    const reviews = reviewData.data || [];
    const commits = commitData.data || [];
    const issues = issueData.data || [];

    // Unique authors and reviewers
    const authors = new Set<string>();
    const reviewers = new Set<string>();
    const repoNames = new Set<string>();
    const languages = new Map<string, number>();
    const fileTypes = new Map<string, number>();
    const directories = new Map<string, number>();

    for (const sig of allSignals) {
      if (sig.entity_type === 'person' || sig.entity_type === 'engineer') {
        authors.add(sig.entity_id);
      }
    }

    for (const pr of prs) {
      const meta = (pr.signal_metadata || {}) as Record<string, any>;
      if (meta.author) authors.add(meta.author);
      if (meta.repo) repoNames.add(meta.repo);
      if (meta.language) {
        const lang = meta.language as string;
        languages.set(lang, (languages.get(lang) || 0) + 1);
      }
      if (meta.files) {
        for (const f of meta.files as string[]) {
          const ext = f.split('.').pop() || 'unknown';
          fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
          const dir = f.split('/').slice(0, -1).join('/') || '/';
          directories.set(dir, (directories.get(dir) || 0) + 1);
        }
      }
    }

    for (const rev of reviews) {
      const meta = (rev.signal_metadata || {}) as Record<string, any>;
      if (meta.reviewer) reviewers.add(meta.reviewer);
    }

    // Cycle times
    const cycleTimes = prs
      .filter(p => p.signal_type === 'pr_cycle_time')
      .map(p => p.signal_value)
      .filter(v => v > 0);
    const avgCycleTime = cycleTimes.length > 0
      ? cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length
      : 0;

    // PR sizes
    const prSizes = prs
      .filter(p => p.signal_type === 'pr_size')
      .map(p => p.signal_value)
      .filter(v => v > 0);
    const avgPRSize = prSizes.length > 0
      ? prSizes.reduce((s, v) => s + v, 0) / prSizes.length
      : 0;

    // Velocity trend
    const now = Date.now();
    const week1 = prs.filter(p => new Date(p.created_at).getTime() > now - 7 * 86400000).length;
    const week2 = prs.filter(p => {
      const t = new Date(p.created_at).getTime();
      return t > now - 14 * 86400000 && t <= now - 7 * 86400000;
    }).length;
    const velocityTrend = week1 > week2 * 1.1
      ? 'accelerating' as const
      : week1 < week2 * 0.75
      ? 'collapsing' as const
      : week1 < week2 * 0.9
      ? 'decelerating' as const
      : 'stable' as const;

    // Top directories
    const topDirs = Array.from(directories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, fileCount: count }));

    // Evolution
    const evo = evolutionData.data?.[0];

    return {
      summary: {
        totalRepos: repoNames.size,
        totalPRs: prs.filter(p => p.signal_type.includes('pr_')).length,
        totalCommits: commits.length,
        totalReviews: reviews.length,
        totalIssues: issues.length,
        totalSignals: allSignals.length,
        uniqueAuthors: authors.size,
        uniqueReviewers: reviewers.size,
        languages: Object.fromEntries(languages),
        avgPRCycleTimeHours: Math.round(avgCycleTime * 10) / 10,
        avgPRSize: Math.round(avgPRSize),
      },
      structure: {
        fileTypes: Object.fromEntries(fileTypes),
        topDirectories: topDirs,
        repoBreakdown: Array.from(repoNames).map(name => ({
          name,
          stars: 0,
          language: '',
          prCount: prs.filter(p => (p.signal_metadata as any)?.repo === name).length,
          commitCount: 0,
          issueCount: 0,
        })),
      },
      complexity: {
        velocityTrend,
        currentVelocity: week1,
        bottleneckRiskLevel: 'unknown',
        topBottleneck: 'N/A',
        reviewConcentration: 0,
        cycleTimeVariance: cycleTimes.length > 1
          ? cycleTimes.reduce((s, v) => s + Math.pow(v - avgCycleTime, 2), 0) / (cycleTimes.length - 1)
          : 0,
      },
      health: {
        brainIntelligenceScore: evo?.intelligence_score || 0,
        brainAccuracy: evo?.accuracy || 0,
        brainBrierScore: evo?.brier_score || 0,
        causalRelationshipsDiscovered: edgeData.count || 0,
        patternsLearned: patternData.count || 0,
        predictionsVerified: 0,
      },
    };
  }

  // ==========================================================================
  // STEP 8: GET BRAIN EVOLUTION DATA
  // ==========================================================================

  async getBrainEvolution(): Promise<{
    intelligenceScore: number;
    accuracy: number;
    brierScore: number;
    totalEdges: number;
    learningVelocity: number;
  } | null> {
    const { data } = await this.supabase
      .from('brain_evolution_snapshots')
      .select('intelligence_score, accuracy, brier_score, total_edges, learning_velocity_score')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!data?.[0]) return null;
    return {
      intelligenceScore: data[0].intelligence_score || 0,
      accuracy: data[0].accuracy || 0,
      brierScore: data[0].brier_score || 0,
      totalEdges: data[0].total_edges || 0,
      learningVelocity: data[0].learning_velocity_score || 0,
    };
  }

  // ==========================================================================
  // MASTER: RUN FULL PIPELINE & GENERATE REPORT
  // ==========================================================================

  async runFullPipeline(repos?: Array<{ owner: string; repo: string }>): Promise<FullIngestionReport> {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(90));
    console.log('  NEXUS INTELLIGENCE — FULL 30-LAYER PIPELINE');
    console.log('  Org: ' + this.orgId);
    console.log('='.repeat(90) + '\n');

    // Step 1: Ensure org
    await this.ensureOrganization();

    // Step 2: Ingest from GitHub
    console.log('\n--- STEP 1: GITHUB INGESTION (Connector → L1) ---\n');
    let ingestionResult = { totalSignals: 0, repoResults: [] as any[] };
    const connectorsUsed: string[] = [];
    try {
      ingestionResult = await this.ingestFromGitHub(repos);
      connectorsUsed.push('github');
    } catch (err: any) {
      console.log(`  GitHub ingestion skipped: ${err.message}`);
      console.log('  (Continuing with existing data in the brain)\n');
    }

    // Step 3: Consolidation (L1-L15)
    console.log('\n--- STEP 2: BRAIN CONSOLIDATION (L1-L15 Causal Discovery) ---\n');
    let consolidation: any = null;
    try {
      consolidation = await this.runConsolidation({ verbose: false });
      console.log(`  Status: ${consolidation.status}`);
      console.log(`  Signals processed: ${consolidation.signalsProcessed}`);
      console.log(`  Causal edges: ${consolidation.causalEdgesDiscovered}`);
      console.log(`  New relationships: ${consolidation.newRelationships}`);
      console.log(`  Patterns found: ${consolidation.patternsFound}`);
      console.log(`  Duration: ${consolidation.durationMs}ms`);
    } catch (err: any) {
      console.log(`  Consolidation error: ${err.message}`);
    }

    // Step 4: Deep layers (L16-L30)
    console.log('\n--- STEP 3: DEEP LAYERS (L16-L30 Organizational Intelligence) ---\n');
    const deepResult = await this.runDeepLayers();
    if (deepResult) {
      console.log(`  Domain hierarchy: ${deepResult.domainHierarchy.resourcesClassified} classified, ${deepResult.domainHierarchy.domainsActive} domains`);
      console.log(`  Entity linking: ${deepResult.entityLinking.artifactsRegistered} artifacts, ${deepResult.entityLinking.linksDiscovered} links`);
      console.log(`  Org topology: ${deepResult.orgTopology.teamsIdentified} teams, ${deepResult.orgTopology.silosDetected} silos`);
      console.log(`  Strategic synthesis: alignment=${deepResult.strategicSynthesis.alignmentScore}`);
      console.log(`  Interventions: ${deepResult.interventions.recommended.length} recommended`);
      console.log(`  Wisdom: ${deepResult.wisdom.principlesLearned} principles`);
      console.log(`  Duration: ${deepResult.durationMs}ms`);
    }

    // Step 5: Reinforcement learning
    console.log('\n--- STEP 4: REINFORCEMENT LEARNING (30-Layer RL Feedback) ---\n');
    const rlResult = await this.runReinforcementCycle();
    if (rlResult) {
      console.log(`  Global reward: ${rlResult.globalReward.toFixed(3)}`);
      console.log(`  Signals emitted: ${rlResult.signals.length}`);
      console.log(`  Scheduling adjustments: ${rlResult.schedulingAdjustments.length}`);
      console.log(`  Compute adjustments: ${rlResult.computeAdjustments.length}`);
      console.log(`  Credit chains: ${rlResult.creditChain.length}`);
    }

    // Step 6: Per-layer percolation table
    console.log('\n--- STEP 5: 30-LAYER PERCOLATION REPORT ---\n');
    const percolation = await this.generateLayerPercolationTable(rlResult);
    this.printLayerTable(percolation);

    // Step 7: Codebase report
    console.log('\n--- STEP 6: CODEBASE ANALYSIS REPORT ---\n');
    const codebaseReport = await this.generateCodebaseReport();
    this.printCodebaseReport(codebaseReport);

    // Step 8: Brain evolution
    console.log('\n--- STEP 7: BRAIN EVOLUTION ---\n');
    const evolution = await this.getBrainEvolution();
    if (evolution) {
      console.log(`  Intelligence Score: ${evolution.intelligenceScore}/100`);
      console.log(`  Accuracy: ${(evolution.accuracy * 100).toFixed(1)}%`);
      console.log(`  Brier Score: ${evolution.brierScore.toFixed(4)} (lower = better calibrated)`);
      console.log(`  Total Edges: ${evolution.totalEdges}`);
      console.log(`  Learning Velocity: ${evolution.learningVelocity.toFixed(2)}`);
    } else {
      console.log('  No evolution data yet (run more consolidation cycles)');
    }

    // Step 9: Early warning
    console.log('\n--- STEP 8: EARLY WARNING SYSTEM ---\n');
    let earlyWarning: any = null;
    try {
      const ewReport = await runEarlyWarningSystem({
        supabase: this.supabase,
        organizationId: this.orgId,
        lookbackDays: 90,
      });
      const ewSummary = getEarlyWarningSummary(ewReport);
      earlyWarning = {
        overallRisk: ewReport.overallRisk,
        riskLevel: ewSummary.riskLevel,
        bottlenecks: ewSummary.totalBottlenecks,
        velocityAtRisk: ewSummary.velocityRisk,
      };
      console.log(`  Overall Risk: ${ewReport.overallRisk}/100`);
      console.log(`  Risk Level: ${ewSummary.riskLevel}`);
      console.log(`  Bottlenecks: ${ewSummary.totalBottlenecks} (${ewSummary.criticalBottlenecks} critical)`);
      console.log(`  Velocity at Risk: ${ewSummary.velocityRisk}`);
    } catch (err: any) {
      console.log(`  Early warning error: ${err.message}`);
    }

    // Brain run report
    let brainRunReport: BrainRunReport | null = null;
    try {
      const reporter = createBrainRunReporter({ supabase: this.supabase, organizationId: this.orgId });
      brainRunReport = await reporter.generateRunReport({ hours: 720 });
    } catch {
      // pass
    }

    // Deep layer health
    let deepHealth: DeepLayerHealthReport | null = null;
    if (deepResult) {
      try {
        const domainTaxonomy = createDomainTaxonomy();
        const entityGraph = createCrossSystemEntityGraph();
        const dl = createDeepLayers({ organizationId: this.orgId, domainTaxonomy, entityGraph });
        deepHealth = dl.getHealthReport();
      } catch {
        // pass
      }
    }

    const totalDuration = Date.now() - startTime;

    // Summary
    console.log('\n' + '='.repeat(90));
    console.log('  PIPELINE COMPLETE');
    console.log(`  Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Signals ingested: ${ingestionResult.totalSignals}`);
    console.log(`  Layers with data: ${percolation.filter(l => l.hasData).length}/30`);
    console.log('='.repeat(90) + '\n');

    return {
      organization: { id: this.orgId, name: DEMO_ORG_NAME },
      ingestion: {
        duration_ms: totalDuration,
        signalsIngested: ingestionResult.totalSignals,
        connectorsUsed,
      },
      codebase: codebaseReport,
      layerPercolation: percolation,
      brainRunReport,
      deepCycleResult: deepResult,
      deepLayerHealth: deepHealth,
      reinforcementLearning: rlResult ? {
        globalReward: rlResult.globalReward,
        signals: rlResult.signals.map(s => ({
          layer: s.targetLayerId,
          type: s.type,
          strength: s.strength,
          reason: s.reason,
        })),
        schedulingAdjustments: rlResult.schedulingAdjustments.map(a => ({
          layer: a.layerId,
          old: a.oldMultiplier,
          new_: a.newMultiplier,
          reason: a.reason,
        })),
      } : null,
      earlyWarning,
      evolution,
    };
  }

  // ==========================================================================
  // PRETTY-PRINT HELPERS
  // ==========================================================================

  private printLayerTable(rows: LayerPercolationRow[]): void {
    const populated = rows.filter(r => r.hasData).length;
    const empty = rows.filter(r => !r.hasData).length;

    console.log(`  Layers with data: ${populated}/30 | Empty: ${empty}/30\n`);

    // Header
    const hdr = [
      'L#'.padStart(3),
      'Layer Name'.padEnd(28),
      'Region'.padEnd(16),
      'Data?'.padEnd(6),
      'Records'.padStart(8),
      'Health'.padEnd(9),
      'RL Sched'.padStart(8),
      'Key Metric',
    ].join(' │ ');
    console.log('  ┌' + '─'.repeat(hdr.length + 2) + '┐');
    console.log('  │ ' + hdr + ' │');
    console.log('  ├' + '─'.repeat(hdr.length + 2) + '┤');

    let currentRegion = '';
    for (const row of rows) {
      if (row.region !== currentRegion) {
        currentRegion = row.region;
        if (row.layerId > 1) {
          console.log('  ├' + '─'.repeat(hdr.length + 2) + '┤');
        }
      }

      const dataIcon = row.hasData ? '✅' : '⬜';
      const healthIcon = row.healthStatus === 'healthy' ? '🟢'
        : row.healthStatus === 'degraded' ? '🟡'
        : row.healthStatus === 'failing' ? '🔴'
        : '⚪';

      // Top key metric
      const metricEntries = Object.entries(row.keyMetrics);
      const topMetric = metricEntries.length > 0
        ? `${metricEntries[0][0]}=${metricEntries[0][1]}`
        : '';

      const line = [
        String(row.layerId).padStart(3),
        row.layerName.padEnd(28),
        row.region.padEnd(16),
        dataIcon.padEnd(4),
        String(row.recordCount).padStart(8),
        `${healthIcon} ${row.healthStatus}`.padEnd(12),
        row.rlSchedulingMultiplier.toFixed(2).padStart(8),
        topMetric.substring(0, 35),
      ].join(' │ ');

      console.log('  │ ' + line + ' │');
    }

    console.log('  └' + '─'.repeat(hdr.length + 2) + '┘');
  }

  private printCodebaseReport(report: CodebaseReport): void {
    console.log('  CODEBASE SUMMARY');
    console.log('  ─────────────────');
    console.log(`  Repos: ${report.summary.totalRepos}`);
    console.log(`  PRs: ${report.summary.totalPRs}`);
    console.log(`  Commits: ${report.summary.totalCommits}`);
    console.log(`  Reviews: ${report.summary.totalReviews}`);
    console.log(`  Issues: ${report.summary.totalIssues}`);
    console.log(`  Total Signals: ${report.summary.totalSignals}`);
    console.log(`  Unique Authors: ${report.summary.uniqueAuthors}`);
    console.log(`  Unique Reviewers: ${report.summary.uniqueReviewers}`);
    console.log(`  Avg PR Cycle Time: ${report.summary.avgPRCycleTimeHours}h`);
    console.log(`  Avg PR Size: ${report.summary.avgPRSize} lines`);

    if (Object.keys(report.summary.languages).length > 0) {
      console.log('\n  LANGUAGES');
      console.log('  ─────────');
      for (const [lang, count] of Object.entries(report.summary.languages).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10)) {
        console.log(`    ${lang}: ${count}`);
      }
    }

    if (Object.keys(report.structure.fileTypes).length > 0) {
      console.log('\n  FILE TYPES');
      console.log('  ──────────');
      for (const [ext, count] of Object.entries(report.structure.fileTypes).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 15)) {
        console.log(`    .${ext}: ${count}`);
      }
    }

    if (report.structure.topDirectories.length > 0) {
      console.log('\n  TOP DIRECTORIES');
      console.log('  ────────────────');
      for (const dir of report.structure.topDirectories.slice(0, 10)) {
        console.log(`    ${dir.path}: ${dir.fileCount} files`);
      }
    }

    console.log('\n  COMPLEXITY');
    console.log('  ──────────');
    console.log(`  Velocity Trend: ${report.complexity.velocityTrend}`);
    console.log(`  Current Velocity: ${report.complexity.currentVelocity} PRs/week`);
    console.log(`  Cycle Time Variance: ${report.complexity.cycleTimeVariance.toFixed(1)}`);

    console.log('\n  BRAIN HEALTH');
    console.log('  ────────────');
    console.log(`  Intelligence Score: ${report.health.brainIntelligenceScore}/100`);
    console.log(`  Accuracy: ${(report.health.brainAccuracy * 100).toFixed(1)}%`);
    console.log(`  Causal Relationships: ${report.health.causalRelationshipsDiscovered}`);
    console.log(`  Patterns Learned: ${report.health.patternsLearned}`);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export async function createNexusIntelligenceClient(
  config?: NexusIntelligenceConfig,
): Promise<NexusIntelligenceClient> {
  const supabaseUrl = config?.supabaseUrl || process.env.SUPABASE_URL || '';
  const supabaseKey = config?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const organizationId = config?.organizationId || DEMO_ORG_ID;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and key required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const fullConfig = {
    ...config,
    supabaseUrl,
    supabaseKey,
    organizationId,
    anthropicApiKey: config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    githubToken: config?.githubToken || process.env.GITHUB_TOKEN,
    githubOwner: config?.githubOwner || process.env.GITHUB_OWNER,
    githubRepo: config?.githubRepo || process.env.GITHUB_REPO,
    platformUrl: config?.platformUrl || process.env.PLATFORM_URL || 'http://localhost:3000',
  };

  return new NexusIntelligenceClient(supabase, fullConfig);
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(90));
  console.log('  NEXUS INTELLIGENCE — 30-LAYER BRAIN PIPELINE');
  console.log('  Ingest → Flow Through 30 Layers → Report');
  console.log('═'.repeat(90) + '\n');

  const client = await createNexusIntelligenceClient();

  // Parse CLI args for repos
  const args = process.argv.slice(2);
  let repos: Array<{ owner: string; repo: string }> | undefined;

  if (args.length >= 2) {
    repos = [{ owner: args[0], repo: args[1] }];
  } else if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
    repos = [{ owner: process.env.GITHUB_OWNER, repo: process.env.GITHUB_REPO }];
  }

  const report = await client.runFullPipeline(repos);

  // Write report to JSON
  const reportPath = `/tmp/nexus-intelligence-report-${Date.now()}.json`;
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved: ${reportPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
}

/**
 * Brain-Native Agent Template V5
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The DEFINITIVE template for NexusBrain training agents. All new agents
 * MUST extend this class. It provides:
 *
 * 1. **Brain-Tight Integration** — Hooks for all 11 brain regions
 * 2. **Auto-Registration** — Agents self-register to AgentRegistry on import
 * 3. **Standardized Capabilities** — Logging, cost tracking, LLM integration
 * 4. **Native Architecture Awareness** — Knows the brain's causal engine
 * 5. **Zero Boilerplate** — Lifecycle managed automatically
 *
 * USAGE:
 * ```typescript
 * import { BrainNativeAgent, type BrainNativeAgentConfig } from './brain-native-agent-template';
 *
 * export class MyTrainingAgent extends BrainNativeAgent {
 *   name = 'my-training-agent';
 *   version = '1.0.0';
 *   description = 'My custom training agent';
 *
 *   async fetch() {
 *     // Fetch data from external sources
 *     return { data: myData, sources: ['API'], recordCount: 100 };
 *   }
 *
 *   async convert(data) {
 *     // Convert to signals + training packs
 *     return { signals: [], packs: [] };
 *   }
 * }
 *
 * // Agent auto-registers on import! No manual registry.register() needed.
 * // Run via AgentManager:
 * const manager = new AgentManager(globalRegistry, config);
 * await manager.runAgent('my-training-agent');
 * ```
 *
 * @packageDocumentation
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BaseTrainingAgent, type AgentConfig, type FetchResult, type ConvertResult, type TrainResult } from './base-training-agent';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';

// ── Brain Region Imports (All 11 Regions + Cost Tracker) ───────────────────
import { createBayesianUpdater } from '../../packages/memory-stack/src/learning/bayesian-updater';
import { createEmbeddingTuner } from '../../packages/memory-stack/src/learning/embedding-tuner';
import { createContrastiveCausalLearner } from '../../packages/memory-stack/src/learning/contrastive-causal-learner';
import { createAttentionPolicyLearner } from '../../packages/memory-stack/src/learning/attention-policy-learner';
import { createImpactScorer } from '../../packages/memory-stack/src/orchestrator/impact-scorer';
import { createAttentionManager } from '../../packages/memory-stack/src/orchestrator/attention-manager';
import { createAnomalyMonitor } from '../../packages/memory-stack/src/orchestrator/anomaly-monitor';
import { createEventBus } from '../../packages/memory-stack/src/causality/event-bus';
import { createCascadeAlertPipeline } from '../../packages/memory-stack/src/orchestrator/cascade-alert-pipeline';
import { createContextManager } from '../../packages/memory-stack/src/orchestrator/context-manager';
import { createBrainAmplifier } from '../../packages/memory-stack/src/orchestrator/llm-brain-amplifier';
import { createCostTracker } from '../../packages/memory-stack/src/persistence/cost-tracker';
import { createFastPathCompiler } from '../../packages/memory-stack/src/orchestrator/fast-path-compiler';
import { createPublicDataLearner } from '../../packages/memory-stack/src/learning/public-data-learner';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';

// ── Agent Registry (for auto-registration) ─────────────────────────────────
import { globalRegistry } from './agent-registry';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface BrainNativeAgentConfig extends AgentConfig {
  /** Enable LLM Brain Amplifier (requires ANTHROPIC_API_KEY or OPENAI_API_KEY) */
  enableLLMAmplifier?: boolean;
  /** Enable cost tracking (logs to llm_cost_log) */
  enableCostTracking?: boolean;
  /** Enable Bayesian weight updates (Region #1: Hippocampus) */
  enableBayesian?: boolean;
  /** Enable embedding fine-tuning (Region #2: Neocortex) */
  enableEmbedding?: boolean;
  /** Enable contrastive causal learning (Region #3: Prefrontal Cortex) */
  enableContrastive?: boolean;
  /** Enable attention policy learning (Region #4: Thalamus) */
  enableAttentionPolicy?: boolean;
  /** Enable impact scoring (Region #5: Amygdala) */
  enableImpactScoring?: boolean;
  /** Enable anomaly monitoring (Region #6: Insula) */
  enableAnomalyMonitoring?: boolean;
  /** Enable cascade alert pipeline (Region #7: Brainstem) */
  enableCascadeAlerts?: boolean;
  /** Enable context tracking (Region #8: Working Memory) */
  enableContextTracking?: boolean;
  /** Enable fast-path compilation (Region #9: Cerebellum) */
  enableFastPath?: boolean;
  /** Enable public data learning (Region #10: Sensory Cortex) */
  enablePublicData?: boolean;

  /** Cron schedule for this agent (e.g., '0 2 * * 0' = Sunday 2 AM UTC) */
  schedule?: string;
  /** ECS resource requirements */
  resourceRequirements?: {
    cpu: string;    // e.g., '2048' (2 vCPU)
    memory: string; // e.g., '8192' MB
  };
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Brain health status reported by the agent after a run.
 */
export interface BrainHealthStatus {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  regions: Array<{
    name: string;
    brainAnalog: string;
    status: 'ok' | 'degraded' | 'critical' | 'not_initialized';
    details?: string;
  }>;
}

/**
 * Post-training statistics from brain regions.
 */
export interface BrainRegionStats {
  bayesian?: {
    updatesApplied: number;
    posteriorsPersisted: number;
    uncertainEdges: number;
  };
  embedding?: {
    initialLoss: number;
    finalLoss: number;
    improvementPct: number;
    pairsUsed: number;
  };
  contrastive?: {
    examplesSeen: number;
    avgLoss: number;
    accuracy: number;
  };
  attentionPolicy?: {
    feedbackProcessed: number;
    avgReward: number;
    policyShift: number;
  };
  impactScoring?: {
    insightsScored: number;
    alertsGenerated: number;
    immediateAlerts: number;
  };
  anomalyMonitoring?: {
    anomaliesDetected: number;
    windowsTracked: number;
  };
  cascadeAlerts?: {
    alertsGenerated: number;
    criticalCount: number;
    highCount: number;
  };
  contextTracking?: {
    insightsRecorded: number;
    hotDomains: string[];
  };
  fastPath?: {
    pathsInvalidated: number;
    pathsPrewarmed: number;
    cacheCleared: number;
  };
  publicData?: {
    sourcesIngested: number;
    signalsGenerated: number;
    errors: string[];
  };
  costTracking?: {
    totalLLMCost: number;
    totalCalls: number;
    totalTokens: number;
  };
}

// ============================================================================
// BRAIN-NATIVE AGENT BASE CLASS
// ============================================================================

/**
 * Brain-Native Training Agent Template V5.
 *
 * Extends BaseTrainingAgent with deep brain region integration. All agents
 * MUST use this template going forward.
 *
 * **Auto-Registration**: Agents self-register to globalRegistry when imported.
 * **Brain-Tight**: Hooks into all 11 brain regions + cost tracker.
 * **LLM-Aware**: Optional Claude integration for amplification.
 * **Cost-Aware**: Tracks every LLM token spent during training.
 *
 * Subclasses implement:
 * - `fetch()` — Pull raw data
 * - `convert()` — Transform to signals + training packs
 *
 * Everything else is handled by the template.
 */
export abstract class BrainNativeAgent extends BaseTrainingAgent {
  // ── Agent metadata (set by subclass) ──
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;

  // ── Brain-native config ──
  protected brainConfig: BrainNativeAgentConfig;

  // ── Brain region instances (lazy-initialized) ──
  protected costTracker?: ReturnType<typeof createCostTracker>;
  protected llmAmplifier?: ReturnType<typeof createBrainAmplifier>;
  protected bayesianUpdater?: ReturnType<typeof createBayesianUpdater>;
  protected embeddingTuner?: ReturnType<typeof createEmbeddingTuner>;
  protected contrastiveLearner?: ReturnType<typeof createContrastiveCausalLearner>;
  protected attentionPolicyLearner?: ReturnType<typeof createAttentionPolicyLearner>;
  protected impactScorer?: ReturnType<typeof createImpactScorer>;
  protected attentionManager?: ReturnType<typeof createAttentionManager>;
  protected anomalyMonitor?: ReturnType<typeof createAnomalyMonitor>;
  protected contextManager?: ReturnType<typeof createContextManager>;
  protected fastPathCompiler?: ReturnType<typeof createFastPathCompiler>;
  protected publicDataLearner?: ReturnType<typeof createPublicDataLearner>;

  // ── Brain region stats (populated during run) ──
  protected regionStats: BrainRegionStats = {};

  constructor(config: BrainNativeAgentConfig) {
    super(config);
    this.brainConfig = {
      ...config,
      // Defaults: enable all regions unless explicitly disabled
      enableCostTracking: config.enableCostTracking ?? true,
      enableLLMAmplifier: config.enableLLMAmplifier ?? false, // Opt-in (requires API key)
      enableBayesian: config.enableBayesian ?? true,
      enableEmbedding: config.enableEmbedding ?? true,
      enableContrastive: config.enableContrastive ?? true,
      enableAttentionPolicy: config.enableAttentionPolicy ?? true,
      enableImpactScoring: config.enableImpactScoring ?? true,
      enableAnomalyMonitoring: config.enableAnomalyMonitoring ?? true,
      enableCascadeAlerts: config.enableCascadeAlerts ?? true,
      enableContextTracking: config.enableContextTracking ?? true,
      enableFastPath: config.enableFastPath ?? true,
      enablePublicData: config.enablePublicData ?? false, // Opt-in
    };
  }

  // ============================================================================
  // LIFECYCLE HOOKS (Template manages these automatically)
  // ============================================================================

  /**
   * Initialize brain regions before training starts.
   * This is called automatically before fetch().
   */
  protected async initializeBrainRegions(): Promise<void> {
    this.divider('INITIALIZING BRAIN REGIONS');

    // Cost Tracker (always enabled for observability)
    if (this.brainConfig.enableCostTracking) {
      this.costTracker = createCostTracker(this.supabase, this.brainConfig.verbose || false);
      this.log('INIT', 'Cost Tracker initialized (llm_cost_log)');
    }

    // LLM Brain Amplifier (Requires API key)
    if (this.brainConfig.enableLLMAmplifier) {
      const llmProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
      const llmApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
      if (llmApiKey) {
        this.llmAmplifier = createBrainAmplifier({
          provider: llmProvider as 'anthropic' | 'openai',
          apiKey: llmApiKey,
          verbose: this.brainConfig.verbose || false,
          costTracker: this.costTracker,
        });
        this.log('INIT', `LLM Brain Amplifier initialized (${llmProvider})`);
      } else {
        this.log('INIT', 'LLM Brain Amplifier skipped (no API key)');
      }
    }

    // Region #1: Hippocampus (Bayesian Updater)
    if (this.brainConfig.enableBayesian) {
      this.bayesianUpdater = createBayesianUpdater({
        supabase: this.supabase,
        organizationId: this.organizationId,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #1: Hippocampus (Bayesian Updater) initialized');
    }

    // Region #2: Neocortex (Embedding Tuner)
    if (this.brainConfig.enableEmbedding) {
      this.embeddingTuner = createEmbeddingTuner({
        supabase: this.supabase,
        organizationId: this.organizationId,
        verbose: this.brainConfig.verbose || false,
        epochs: 3,
      });
      this.log('INIT', 'Region #2: Neocortex (Embedding Tuner) initialized');
    }

    // Region #3: Prefrontal Cortex (Contrastive Causal Learner)
    if (this.brainConfig.enableContrastive) {
      this.contrastiveLearner = createContrastiveCausalLearner({
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #3: Prefrontal Cortex (Contrastive Learner) initialized');
    }

    // Region #4: Thalamus (Attention Policy Learner)
    if (this.brainConfig.enableAttentionPolicy) {
      this.attentionPolicyLearner = createAttentionPolicyLearner({
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #4: Thalamus (Attention Policy Learner) initialized');
    }

    // Region #5: Amygdala (Impact Scorer)
    if (this.brainConfig.enableImpactScoring) {
      this.impactScorer = createImpactScorer({
        supabase: this.supabase,
        organizationId: this.organizationId,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #5: Amygdala (Impact Scorer) initialized');
    }

    // Region #6: Insula (Anomaly Monitor)
    if (this.brainConfig.enableAnomalyMonitoring) {
      const eventBus = createEventBus({ debounceMs: 0 });
      this.anomalyMonitor = createAnomalyMonitor(eventBus, {
        threshold: 2.5,
        windowSize: 20,
        minWindowSize: 5,
      });
      this.log('INIT', 'Region #6: Insula (Anomaly Monitor) initialized');
    }

    // Region #7: Brainstem (Attention Manager)
    if (this.brainConfig.enableCascadeAlerts) {
      this.attentionManager = createAttentionManager({
        supabase: this.supabase,
        organizationId: this.organizationId,
        maxAlertsPerDay: 20,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #7: Brainstem (Attention Manager) initialized');
    }

    // Region #8: Working Memory (Context Manager)
    if (this.brainConfig.enableContextTracking) {
      this.contextManager = createContextManager({
        supabase: this.supabase,
        organizationId: this.organizationId,
      });
      this.log('INIT', 'Region #8: Working Memory (Context Manager) initialized');
    }

    // Region #9: Cerebellum (Fast-Path Compiler)
    if (this.brainConfig.enableFastPath) {
      this.fastPathCompiler = createFastPathCompiler({
        supabase: this.supabase,
        organizationId: this.organizationId,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #9: Cerebellum (Fast-Path Compiler) initialized');
    }

    // Region #10: Sensory Cortex (Public Data Learner)
    if (this.brainConfig.enablePublicData) {
      this.publicDataLearner = createPublicDataLearner({
        supabase: this.supabase,
        organizationId: this.organizationId,
        fredApiKey: process.env.FRED_API_KEY,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('INIT', 'Region #10: Sensory Cortex (Public Data Learner) initialized');
    }

    this.log('INIT', 'All brain regions initialized ✓');
  }

  /**
   * Post-training hook: Run brain region learning cycles.
   * This is called automatically after train() completes.
   */
  protected async runBrainRegionLearning(): Promise<void> {
    if (this.config.dryRun) {
      this.log('LEARN', '[DRY RUN] Skipping brain region learning');
      return;
    }

    this.divider('BRAIN REGION LEARNING');

    // Region #1: Bayesian Weight Updates
    if (this.bayesianUpdater) {
      try {
        const loaded = await this.bayesianUpdater.loadFromDatabase();
        this.log('LEARN', `Bayesian: loaded ${loaded} edge posteriors`);

        // Get verified predictions from last 7 days
        const { data: verifiedPredictions } = await this.supabase
          .from('prediction_records')
          .select('domain, entity_id, prediction_type, predicted_value, confidence, was_correct')
          .eq('organization_id', this.organizationId)
          .not('was_correct', 'is', null)
          .gte('verified_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(200);

        let updates = 0;
        if (verifiedPredictions && verifiedPredictions.length > 0) {
          for (const p of verifiedPredictions) {
            this.bayesianUpdater.update({
              sourceDomain: p.domain || 'unknown',
              targetDomain: p.entity_id || p.domain || 'unknown',
              wasCorrect: p.was_correct || false,
              predictionConfidence: p.confidence || 0.5,
            });
            updates++;
          }
          const persisted = await this.bayesianUpdater.persistPosteriors();
          this.log('LEARN', `Bayesian: ${updates} updates, ${persisted} posteriors persisted`);
          this.regionStats.bayesian = {
            updatesApplied: updates,
            posteriorsPersisted: persisted,
            uncertainEdges: this.bayesianUpdater.getUncertainEdges(0.25).length,
          };
        }
      } catch (err) {
        this.logError('LEARN', 'Bayesian update failed', err);
      }
    }

    // Region #2: Embedding Fine-Tuning
    if (this.embeddingTuner) {
      try {
        const loadedTransform = await this.embeddingTuner.loadFromDatabase();
        if (loadedTransform) {
          this.log('LEARN', 'Embedding tuner: loaded saved transform');
        }
        const tuneResult = await this.embeddingTuner.tune();
        if (tuneResult.pairsUsed > 0) {
          this.log('LEARN', `Embedding: loss ${tuneResult.initialLoss.toFixed(4)} → ${tuneResult.finalLoss.toFixed(4)} (${tuneResult.improvement.toFixed(1)}% improvement)`);
          await this.embeddingTuner.persistTransform();
          this.regionStats.embedding = {
            initialLoss: tuneResult.initialLoss,
            finalLoss: tuneResult.finalLoss,
            improvementPct: tuneResult.improvement,
            pairsUsed: tuneResult.pairsUsed,
          };
        }
      } catch (err) {
        this.logError('LEARN', 'Embedding tuning failed', err);
      }
    }

    // Region #3: Contrastive Causal Learning
    if (this.contrastiveLearner) {
      try {
        const loadedModel = await this.contrastiveLearner.loadFromDatabase(this.supabase, this.organizationId);
        if (loadedModel) {
          this.log('LEARN', 'Contrastive: loaded saved model');
        }

        // Build training examples from verified causal edges
        const { data: edges } = await this.supabase
          .from('causal_relationships_statistical')
          .select('source_domain, target_domain, is_significant, evidence_weight')
          .eq('organization_id', this.organizationId)
          .limit(100);

        if (edges && edges.length >= 5) {
          const examples = [];
          const allDomains = [...new Set(edges.map(e => e.source_domain).concat(edges.map(e => e.target_domain)))];

          for (const edge of edges) {
            examples.push({
              sourceDomain: edge.source_domain,
              targetDomain: edge.target_domain,
              label: edge.is_significant ? 1 : 0,
              labelConfidence: edge.evidence_weight || 0.5,
            });

            const randomDomain = allDomains[Math.floor(Math.random() * allDomains.length)];
            if (randomDomain !== edge.source_domain) {
              examples.push({
                sourceDomain: edge.source_domain,
                targetDomain: randomDomain,
                label: 0,
                labelConfidence: 0.3,
              });
            }
          }

          const result = this.contrastiveLearner.trainBatch(examples);
          const stats = this.contrastiveLearner.getStats();
          this.log('LEARN', `Contrastive: ${stats.examplesSeen} examples, loss=${result.avgLoss.toFixed(4)}, accuracy=${(result.accuracy * 100).toFixed(1)}%`);
          await this.contrastiveLearner.persistToDatabase(this.supabase, this.organizationId);
          this.regionStats.contrastive = {
            examplesSeen: stats.examplesSeen,
            avgLoss: result.avgLoss,
            accuracy: result.accuracy,
          };
        }
      } catch (err) {
        this.logError('LEARN', 'Contrastive learning failed', err);
      }
    }

    // Region #4: Attention Policy Learning
    if (this.attentionPolicyLearner) {
      try {
        const loadedPolicy = await this.attentionPolicyLearner.loadFromDatabase(this.supabase, this.organizationId);
        if (loadedPolicy) {
          this.log('LEARN', 'Attention Policy: loaded saved policy');
        }

        const { data: feedback } = await this.supabase
          .from('attention_decisions')
          .select('event_id, action, components')
          .eq('organization_id', this.organizationId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(200);

        if (feedback && feedback.length > 0) {
          const feedbackBatch = feedback
            .filter((f: any) => f.components && f.action)
            .map((f: any) => ({
              eventId: f.event_id,
              action: f.action as 'acted_on' | 'acknowledged' | 'ignored' | 'dismissed' | 'misfire',
              components: f.components,
            }));

          if (feedbackBatch.length > 0) {
            const result = this.attentionPolicyLearner.processFeedbackBatch(feedbackBatch);
            this.log('LEARN', `Attention Policy: ${result.updatesApplied} feedback, avgReward=${result.avgReward.toFixed(3)}`);
            await this.attentionPolicyLearner.persistToDatabase(this.supabase, this.organizationId);
            this.regionStats.attentionPolicy = {
              feedbackProcessed: result.updatesApplied,
              avgReward: result.avgReward,
              policyShift: result.policyShift,
            };
          }
        }
      } catch (err) {
        this.logError('LEARN', 'Attention policy learning failed', err);
      }
    }

    // Region #9: Fast-Path Invalidation + Pre-Warming
    if (this.fastPathCompiler) {
      try {
        await this.fastPathCompiler.invalidateAll();
        const { count: cacheCleared } = await this.supabase
          .from('fast_path_cache')
          .delete()
          .eq('organization_id', this.organizationId)
          .lt('expires_at', new Date().toISOString())
          .select('*', { count: 'exact', head: true });

        this.log('LEARN', `Fast-Path: invalidated all, ${cacheCleared ?? 0} expired cache entries cleared`);

        // Pre-warm common query shapes
        const warmupQueries = [
          'Why did revenue change?',
          'What caused churn to increase?',
          'How is customer acquisition trending?',
          'What is driving cost increases?',
        ];
        let warmed = 0;
        for (const query of warmupQueries) {
          try {
            await this.fastPathCompiler.precompile(query);
            warmed++;
          } catch {
            // Some queries may not have enough graph data
          }
        }
        this.log('LEARN', `Fast-Path: pre-warmed ${warmed}/${warmupQueries.length} common queries`);
        this.regionStats.fastPath = {
          pathsInvalidated: 1,
          pathsPrewarmed: warmed,
          cacheCleared: cacheCleared ?? 0,
        };
      } catch (err) {
        this.logError('LEARN', 'Fast-path learning failed', err);
      }
    }

    this.log('LEARN', 'Brain region learning complete ✓');
  }

  /**
   * Override train() to wire brain region learning AFTER signal/pack storage.
   */
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    // Call base implementation first
    const result = await super.train(signals, packs);

    // Run brain region learning cycles
    await this.runBrainRegionLearning();

    return result;
  }

  /**
   * Override run() to initialize brain regions BEFORE fetch().
   */
  async run() {
    await this.initializeBrainRegions();
    return super.run();
  }

  // ============================================================================
  // AUTO-REGISTRATION (happens when subclass is imported)
  // ============================================================================

  /**
   * Register this agent to the global registry automatically.
   * Called by subclasses in their static initialization block.
   */
  protected static registerAgent<T extends BrainNativeAgent>(
    this: new (config: BrainNativeAgentConfig) => T,
    options: {
      name: string;
      description: string;
      version: string;
      schedule?: string;
      resourceRequirements?: { cpu: string; memory: string };
      tags?: string[];
    }
  ): void {
    globalRegistry.register({
      name: options.name,
      description: options.description,
      version: options.version,
      factory: (config) => new this(config as BrainNativeAgentConfig),
      schedule: options.schedule,
      resourceRequirements: options.resourceRequirements,
      tags: options.tags,
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export type { BrainHealthStatus, BrainRegionStats };

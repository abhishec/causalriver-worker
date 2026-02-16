#!/usr/bin/env tsx
/**
 * Nexus Intelligence Programmatic Client
 * ========================================
 *
 * A comprehensive SDK/wrapper that connects to the Demo Org
 * (00000000-0000-4000-b000-000000000001) and provides programmatic
 * access to ALL P0 + P1 use cases defined in the Brain Phase 1
 * Technical Solution Document.
 *
 * P0 CASES (Risk Intelligence):
 *   1. Deploy Velocity Collapse Warning
 *   2. Bottleneck Concentration Risk
 *
 * P1 CASES (AI-Powered Developer Intelligence):
 *   1.1  TDD Code Generation Agent
 *   1.2  Boilerplate & Scaffolding Generator
 *   1.3  PR Review & Iteration Assistant
 *   1.4  Dependency Upgrade Assistant
 *   1.5  HLD/LLD Document Generator
 *   2.1  Data Model Lineage Mapper
 *   2.2  Impact Analysis Agent
 *   2.3  SQL Query Analyzer
 *   3.1  Log Query & Analysis Agent
 *   3.2  Incident Diagnosis Assistant
 *   3.4  Performance Profiler
 *   4.1  Codebase Q&A Agent
 *   4.2  Architecture Extractor
 *   4.3  Dead Code Detector
 *   5.1  Test Case Generator
 *
 * USAGE:
 *   import { createNexusIntelligenceClient } from './nexus-intelligence-client'
 *
 *   const client = await createNexusIntelligenceClient()
 *
 *   // Ingest data from GitHub + Jira
 *   await client.connectors.github.fullSync()
 *   await client.connectors.jira.fullSync()
 *
 *   // Run brain consolidation (causal discovery)
 *   await client.brain.consolidate()
 *
 *   // P0: Early Warning
 *   const velocity = await client.p0.analyzeVelocityCollapse()
 *   const bottleneck = await client.p0.analyzeBottleneckRisk()
 *
 *   // P1: SE-aaS Domains
 *   const tests = await client.p1.generateTestCases({ sourceCode: '...', language: 'typescript' })
 *   const impact = await client.p1.analyzeImpact({ changeType: 'code', description: '...' })
 *
 * @packageDocumentation
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../packages/memory-stack/src/persistence/supabase-repository';
import { createConsolidationEngine } from '../packages/memory-stack/src/orchestrator/consolidation-engine';
import {
  storeConnectorSignals,
  ingestRawSignals,
  type ConnectorSignal,
} from '../packages/memory-stack/src/connectors/connector-framework';
import { createGitHubConnector } from '../packages/memory-stack/src/connectors/github';
import { createJiraConnector } from '../packages/memory-stack/src/connectors/jira';
import { ingestLinearData } from '../packages/memory-stack/src/connectors/linear';
import {
  detectBottlenecks,
  detectAllBottlenecks,
  getBottleneckHeatmap,
  generateBottleneckAlerts,
  calculateGiniCoefficient,
  calculateHHI,
  calculateBetweennessCentrality,
  calculateEigenvectorCentrality,
  getBRSRiskLevel,
  type BottleneckMetrics,
} from '../packages/memory-stack/src/orchestrator/bottleneck-detector';
import {
  runEarlyWarningSystem,
  getEarlyWarningSummary,
  type EarlyWarningReport,
} from '../packages/memory-stack/src/orchestrator/early-warning-system';
import { predictVelocity, type VelocityPrediction } from '../platform/lib/p0/velocity-predictor';
import { getDefaultLogger } from '../packages/memory-stack/src/observability';

const logger = getDefaultLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';
const DEMO_ORG_NAME = 'Competition Demo 2026';

export interface NexusIntelligenceConfig {
  /** Supabase project URL */
  supabaseUrl?: string;
  /** Supabase service role key (server-side) or anon key */
  supabaseKey?: string;
  /** Organization ID (defaults to Demo Org) */
  organizationId?: string;
  /** Anthropic API key for Claude-powered domains */
  anthropicApiKey?: string;
  /** GitHub personal access token */
  githubToken?: string;
  /** GitHub repository owner (org or user) */
  githubOwner?: string;
  /** GitHub repository name */
  githubRepo?: string;
  /** Jira configuration */
  jira?: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKeys?: string[];
  };
  /** Linear API key */
  linearApiKey?: string;
  /** Platform base URL (for SE-aaS API calls) */
  platformUrl?: string;
}

// ============================================================================
// TYPES: P0 USE CASES
// ============================================================================

export interface VelocityCollapseResult {
  currentVelocity: number;
  historicalMean: number;
  historicalStdDev: number;
  percentDrop: number;
  zScore: number;
  collapseDetected: boolean;
  collapseReason: string[];
  confidence: number;
  prediction: VelocityPrediction | null;
  featureVector: VelocityFeatureVector | null;
}

export interface VelocityFeatureVector {
  prsMergedLast7d: number;
  prsMergedLast14d: number;
  prsMergedLast30d: number;
  avgCycleTimeHours: number;
  cycleTimeVariance: number;
  prSizeMean: number;
  reviewerCountPerPrMean: number;
  reviewConcentrationIndex: number;
  openPrCountTrend: number;
  prsPerEngineer: number;
  jiraTicketsResolved7d: number;
  jiraTicketCycleTimeHours: number;
  velocityZScore: number;
  reviewerHHI: number;
  reviewerGini: number;
}

export interface BottleneckRiskResult {
  topReviewer: string;
  reviewShare: number;
  giniCoefficient: number;
  hhi: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reviewerBreakdown: Array<{
    reviewer: string;
    reviewCount: number;
    share: number;
    avgLatencyHours: number;
    betweennessCentrality: number;
  }>;
  alerts: Array<{
    severity: string;
    message: string;
    actions: string[];
  }>;
  heatmap: Record<string, number>;
}

// ============================================================================
// TYPES: P1 USE CASES
// ============================================================================

export interface TestCaseRequest {
  sourceCode: string;
  language: string;
  framework?: string;
  testTypes?: ('unit' | 'integration' | 'edge-case')[];
  coverageGoal?: number;
}

export interface TDDCodeRequest {
  requirements: string;
  language: string;
  framework?: string;
}

export interface SQLAnalysisRequest {
  query: string;
  schema?: string;
  analysisTypes?: ('correctness' | 'performance' | 'security')[];
  databaseType?: string;
}

export interface DataLineageRequest {
  schema: string;
  queryLogs?: string[];
  etlDefinitions?: string[];
  focusTables?: string[];
  databaseType?: string;
}

export interface IncidentDiagnosisRequest {
  description: string;
  logs?: string[];
  stackTrace?: string;
  metrics?: Record<string, number>;
  affectedServices?: string[];
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface ImpactAnalysisRequest {
  changeType: 'code' | 'deployment' | 'incident' | 'config' | 'infrastructure';
  description: string;
  components?: string[];
  diff?: string;
  environment?: string;
}

export interface DependencyUpgradeRequest {
  packageManager: string;
  lockfile?: string;
  packageJson?: string;
  targetPackages?: string[];
}

export interface DesignDocRequest {
  requirements: string;
  docType: 'hld' | 'lld';
  existingCode?: string;
  codebase?: string;
}

export interface LogQueryRequest {
  query: string;
  logSource?: string;
  timeRange?: { start: string; end: string };
  services?: string[];
}

export interface PerformanceProfileRequest {
  code?: string;
  endpoint?: string;
  metrics?: Record<string, number>;
  traceData?: string;
}

export interface DeadCodeRequest {
  sourceCode: string;
  language: string;
  entryPoints?: string[];
}

export interface CodebaseQueryRequest {
  question: string;
  codeContext?: string;
  domain?: string;
}

// ============================================================================
// TYPES: SE-aaS GENERIC
// ============================================================================

interface SeAaSJobResult {
  jobId?: string;
  status: 'completed' | 'queued' | 'failed';
  result: Record<string, unknown>;
  artifactId?: string;
}

// ============================================================================
// MAIN CLIENT CLASS
// ============================================================================

export class NexusIntelligenceClient {
  private supabase: SupabaseClient;
  private config: Required<
    Pick<NexusIntelligenceConfig, 'organizationId'>
  > & NexusIntelligenceConfig;
  private repository: ReturnType<typeof createSupabaseRepository>;

  constructor(
    supabase: SupabaseClient,
    config: NexusIntelligenceConfig & { organizationId: string },
  ) {
    this.supabase = supabase;
    this.config = config;
    this.repository = createSupabaseRepository(supabase, config.organizationId);
  }

  // ==========================================================================
  // ORGANIZATION INFO
  // ==========================================================================

  get organizationId(): string {
    return this.config.organizationId;
  }

  async getOrganization(): Promise<{ id: string; name: string; slug: string } | null> {
    const { data } = await this.supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', this.config.organizationId)
      .single();
    return data;
  }

  async ensureOrganization(): Promise<void> {
    const org = await this.getOrganization();
    if (org) {
      logger.info(`Organization exists: ${org.name} (${org.id})`);
      return;
    }

    const { error } = await this.supabase.from('organizations').insert({
      id: this.config.organizationId,
      name: DEMO_ORG_NAME,
      slug: 'competition-demo-2026',
      created_at: new Date().toISOString(),
    });

    if (error) throw new Error(`Failed to create organization: ${error.message}`);
    logger.info(`Created organization: ${DEMO_ORG_NAME} (${this.config.organizationId})`);
  }

  // ==========================================================================
  // CONNECTORS: Data Ingestion Layer (L1)
  // ==========================================================================

  connectors = {
    /**
     * GitHub Connector — Ingests repos, PRs, reviews, commits, issues.
     * Critical for P0 velocity + bottleneck analysis.
     */
    github: {
      fullSync: async (): Promise<{
        success: boolean;
        signalsGenerated: number;
        duration_ms: number;
      }> => {
        if (!this.config.githubToken) {
          throw new Error('GitHub token required. Set GITHUB_TOKEN or pass githubToken in config.');
        }

        logger.info('Starting GitHub full sync...');
        const connector = createGitHubConnector({
          token: this.config.githubToken!,
          owner: this.config.githubOwner || 'demo',
          repo: this.config.githubRepo || 'demo',
        });

        const result = await connector.fullSync(this.supabase, this.config.organizationId);
        logger.info(`GitHub sync complete: ${result.signalsGenerated} signals, ${result.duration_ms}ms`);
        return {
          success: result.success,
          signalsGenerated: result.signalsGenerated,
          duration_ms: result.duration_ms,
        };
      },

      incrementalSync: async (since?: Date): Promise<{
        success: boolean;
        signalsGenerated: number;
        duration_ms: number;
      }> => {
        if (!this.config.githubToken) {
          throw new Error('GitHub token required.');
        }

        const syncSince = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
        logger.info(`Starting GitHub incremental sync since ${syncSince.toISOString()}...`);

        const connector = createGitHubConnector({
          token: this.config.githubToken!,
          owner: this.config.githubOwner || 'demo',
          repo: this.config.githubRepo || 'demo',
        });

        const result = await connector.incrementalSync(
          this.supabase,
          this.config.organizationId,
          syncSince,
        );
        return {
          success: result.success,
          signalsGenerated: result.signalsGenerated,
          duration_ms: result.duration_ms,
        };
      },
    },

    /**
     * Jira Connector — Ingests issues, sprints, velocity metrics.
     * Critical for P0 velocity analysis.
     */
    jira: {
      fullSync: async (): Promise<{
        success: boolean;
        signalsGenerated: number;
        duration_ms: number;
      }> => {
        if (!this.config.jira) {
          throw new Error('Jira config required. Pass jira: { baseUrl, email, apiToken } in config.');
        }

        logger.info('Starting Jira full sync...');
        const connector = createJiraConnector(this.config.jira);
        const result = await connector.fullSync(this.supabase, this.config.organizationId);
        logger.info(`Jira sync complete: ${result.signalsGenerated} signals, ${result.duration_ms}ms`);
        return {
          success: result.success,
          signalsGenerated: result.signalsGenerated,
          duration_ms: result.duration_ms,
        };
      },

      incrementalSync: async (since?: Date): Promise<{
        success: boolean;
        signalsGenerated: number;
        duration_ms: number;
      }> => {
        if (!this.config.jira) {
          throw new Error('Jira config required.');
        }

        const syncSince = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
        const connector = createJiraConnector(this.config.jira);
        const result = await connector.incrementalSync(
          this.supabase,
          this.config.organizationId,
          syncSince,
        );
        return {
          success: result.success,
          signalsGenerated: result.signalsGenerated,
          duration_ms: result.duration_ms,
        };
      },
    },

    /**
     * Linear Connector — Alternative to Jira for issue tracking.
     */
    linear: {
      sync: async (since?: Date): Promise<{
        signalsGenerated: number;
      }> => {
        if (!this.config.linearApiKey) {
          throw new Error('Linear API key required.');
        }

        logger.info('Starting Linear sync...');
        const signals = await ingestLinearData(
          { apiKey: this.config.linearApiKey },
          this.config.organizationId,
          since,
        );

        await storeConnectorSignals(
          this.supabase,
          signals,
          undefined,
          this.config.organizationId,
        );

        logger.info(`Linear sync complete: ${signals.length} signals`);
        return { signalsGenerated: signals.length };
      },
    },

    /**
     * Ingest raw signals directly (for custom data sources).
     */
    ingestRaw: async (
      signals: Array<{
        domain: string;
        type: string;
        value: number;
        entity?: string;
        entityType?: string;
        timestamp?: Date | string;
        metadata?: Record<string, unknown>;
      }>,
    ): Promise<{ signalsIngested: number; errors: string[] }> => {
      return ingestRawSignals(this.supabase, this.config.organizationId, signals);
    },
  };

  // ==========================================================================
  // BRAIN: Causal Intelligence Core (L1-L7)
  // ==========================================================================

  brain = {
    /**
     * Run brain consolidation — discovers causal relationships.
     * This is the "brain sleep" cycle that does Granger causality,
     * pattern mining, prediction verification, and weight updates.
     */
    consolidate: async (options?: {
      lookbackHours?: number;
      discoveryLookbackDays?: number;
      verbose?: boolean;
    }): Promise<{
      success: boolean;
      signalsProcessed: number;
      newRelationships: number;
      patternsFound: number;
    }> => {
      logger.info('Running brain consolidation...');

      const engine = createConsolidationEngine({
        supabase: this.supabase,
        organizationId: this.config.organizationId,
        lookbackHours: options?.lookbackHours ?? 24,
        discoveryLookbackDays: options?.discoveryLookbackDays ?? 90,
        verbose: options?.verbose ?? false,
      });

      const result = await engine.runConsolidation();

      logger.info(
        `Consolidation complete: ${result.report.stats.signalsProcessed} signals, ` +
        `${result.report.stats.newRelationships} relationships, ` +
        `${result.report.stats.patternsFound} patterns`,
      );

      return {
        success: result.status === 'success' || result.status === 'partial',
        signalsProcessed: result.report.stats.signalsProcessed,
        newRelationships: result.report.stats.newRelationships,
        patternsFound: result.report.stats.patternsFound,
      };
    },

    /**
     * Query the brain with natural language.
     */
    query: async (
      question: string,
      options?: { domain?: string },
    ): Promise<{
      answer: string;
      causalRelationships: number;
      patterns: number;
    }> => {
      // Use platform API for brain queries (requires running platform)
      const platformUrl = this.config.platformUrl || 'http://localhost:3000';
      const response = await fetch(`${platformUrl}/api/brain/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: this.config.organizationId,
          query: question,
          domain: options?.domain,
        }),
      });

      if (!response.ok) {
        throw new Error(`Brain query failed: ${response.status} ${await response.text()}`);
      }

      const data = await response.json();
      return {
        answer: data.answer || data.result?.answer || '',
        causalRelationships: data.context?.causal?.length || 0,
        patterns: data.context?.patterns?.length || 0,
      };
    },

    /**
     * Get all discovered causal relationships.
     */
    getRelationships: async (options?: {
      minEffectSize?: number;
      significantOnly?: boolean;
      limit?: number;
    }): Promise<Array<{
      source_domain: string;
      target_domain: string;
      effect_size: number;
      lag_days: number;
      p_value: number;
      natural_language: string;
      evidence_weight: number;
    }>> => {
      let query = this.supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', this.config.organizationId)
        .order('effect_size', { ascending: false })
        .limit(options?.limit ?? 50);

      if (options?.significantOnly !== false) {
        query = query.eq('is_significant', true);
      }
      if (options?.minEffectSize) {
        query = query.gte('effect_size', options.minEffectSize);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch relationships: ${error.message}`);

      return (data || []).map((r: any) => ({
        source_domain: r.source_domain,
        target_domain: r.target_domain,
        effect_size: r.effect_size,
        lag_days: r.optimal_lag_days,
        p_value: r.granger_p_value,
        natural_language: r.natural_language,
        evidence_weight: r.evidence_weight,
      }));
    },

    /**
     * Get brain health metrics.
     */
    getHealth: async (): Promise<{
      signalCount: number;
      relationshipCount: number;
      patternCount: number;
      predictionAccuracy: number;
      lastConsolidation: string | null;
    }> => {
      const [signals, relationships, patterns, predictions, consolidations] = await Promise.all([
        this.supabase
          .from('cross_domain_signals')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', this.config.organizationId),
        this.supabase
          .from('causal_relationships_statistical')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', this.config.organizationId)
          .eq('is_significant', true),
        this.supabase
          .from('brain_grammar_rules')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', this.config.organizationId)
          .eq('is_active', true),
        this.supabase
          .from('prediction_records')
          .select('was_correct')
          .eq('organization_id', this.config.organizationId)
          .not('was_correct', 'is', null)
          .limit(100),
        this.supabase
          .from('consolidation_runs')
          .select('completed_at')
          .eq('organization_id', this.config.organizationId)
          .eq('status', 'success')
          .order('completed_at', { ascending: false })
          .limit(1),
      ]);

      const verified = predictions.data || [];
      const correct = verified.filter((p: any) => p.was_correct).length;
      const accuracy = verified.length > 0 ? correct / verified.length : 0;

      return {
        signalCount: signals.count || 0,
        relationshipCount: relationships.count || 0,
        patternCount: patterns.count || 0,
        predictionAccuracy: Math.round(accuracy * 100) / 100,
        lastConsolidation: consolidations.data?.[0]?.completed_at || null,
      };
    },
  };

  // ==========================================================================
  // P0: DEPLOY VELOCITY COLLAPSE WARNING + BOTTLENECK CONCENTRATION RISK
  // ==========================================================================

  p0 = {
    /**
     * Use Case 1: Deploy Velocity Collapse Warning
     *
     * Analyzes PR merge velocity, cycle times, and engineering metrics to
     * predict imminent velocity collapses. Uses Gradient Boosted Trees
     * for forecasting.
     *
     * Collapse triggered if:
     * - Next sprint velocity < (mean of last 3 sprints - 1 std deviation)
     * - OR >25% drop sprint-over-sprint
     *
     * Alert triggered if:
     * - Predicted velocity < 0.8 x historical_mean
     * - AND prediction confidence > 70%
     */
    analyzeVelocityCollapse: async (options?: {
      lookbackDays?: number;
      forecastDays?: number;
    }): Promise<VelocityCollapseResult> => {
      const lookbackDays = options?.lookbackDays ?? 90;
      logger.info(`Analyzing velocity collapse (lookback: ${lookbackDays}d)...`);

      // Fetch PR merge data from pull_requests table
      const since = new Date();
      since.setDate(since.getDate() - lookbackDays);

      const { data: prs } = await this.supabase
        .from('pull_requests')
        .select('merged_at, cycle_time_hours, additions, deletions, changed_files, review_latency_hours, author_login')
        .eq('organization_id', this.config.organizationId)
        .eq('is_merged', true)
        .gte('merged_at', since.toISOString())
        .order('merged_at', { ascending: true });

      const { data: reviews } = await this.supabase
        .from('pr_reviews')
        .select('reviewer_login, review_submitted_at, review_state')
        .eq('organization_id', this.config.organizationId)
        .gte('review_submitted_at', since.toISOString());

      if (!prs || prs.length === 0) {
        return {
          currentVelocity: 0,
          historicalMean: 0,
          historicalStdDev: 0,
          percentDrop: 0,
          zScore: 0,
          collapseDetected: false,
          collapseReason: ['No PR data available'],
          confidence: 0,
          prediction: null,
          featureVector: null,
        };
      }

      // Compute weekly velocity windows
      const weeklyVelocity: number[] = [];
      const now = new Date();
      for (let w = 0; w < Math.ceil(lookbackDays / 7); w++) {
        const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const count = prs.filter(
          (pr) => new Date(pr.merged_at) >= weekStart && new Date(pr.merged_at) < weekEnd,
        ).length;
        weeklyVelocity.unshift(count);
      }

      const currentVelocity = weeklyVelocity[weeklyVelocity.length - 1] || 0;
      const historicalMean = weeklyVelocity.reduce((s, v) => s + v, 0) / weeklyVelocity.length;
      const historicalStdDev = Math.sqrt(
        weeklyVelocity.reduce((s, v) => s + Math.pow(v - historicalMean, 2), 0) / weeklyVelocity.length,
      );
      const zScore = historicalStdDev > 0
        ? (currentVelocity - historicalMean) / historicalStdDev
        : 0;
      const prevVelocity = weeklyVelocity.length >= 2 ? weeklyVelocity[weeklyVelocity.length - 2] : currentVelocity;
      const percentDrop = prevVelocity > 0
        ? ((prevVelocity - currentVelocity) / prevVelocity) * 100
        : 0;

      // Collapse detection
      const collapseReason: string[] = [];
      if (zScore < -1.0) {
        collapseReason.push(`Velocity z-score ${zScore.toFixed(2)} (below -1.0 threshold)`);
      }
      if (percentDrop > 25) {
        collapseReason.push(`Sprint-over-sprint drop ${percentDrop.toFixed(1)}% (>25% threshold)`);
      }

      const collapseDetected = collapseReason.length > 0;
      const confidence = Math.min(weeklyVelocity.length / 12, 1.0);

      // Build feature vector for ML prediction
      const recentPRs = prs.filter(
        (pr) => new Date(pr.merged_at) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      );
      const cycleTimes = recentPRs.map((pr) => pr.cycle_time_hours || 0).filter((ct) => ct > 0);
      const avgCycleTime = cycleTimes.length > 0
        ? cycleTimes.reduce((s, ct) => s + ct, 0) / cycleTimes.length
        : 0;
      const cycleTimeVariance = cycleTimes.length > 1
        ? cycleTimes.reduce((s, ct) => s + Math.pow(ct - avgCycleTime, 2), 0) / (cycleTimes.length - 1)
        : 0;

      // Reviewer concentration for feature vector
      const reviewerCounts = new Map<string, number>();
      for (const r of reviews || []) {
        if (r.reviewer_login) {
          reviewerCounts.set(r.reviewer_login, (reviewerCounts.get(r.reviewer_login) || 0) + 1);
        }
      }
      const reviewCounts = [...reviewerCounts.values()];
      const reviewerHHI = reviewCounts.length > 0 ? calculateHHI(reviewCounts) : 0;
      const reviewerGini = reviewCounts.length > 0 ? calculateGiniCoefficient(reviewCounts) : 0;

      // Unique engineers
      const uniqueEngineers = new Set(prs.map((pr) => pr.author_login)).size;

      const featureVector: VelocityFeatureVector = {
        prsMergedLast7d: weeklyVelocity[weeklyVelocity.length - 1] || 0,
        prsMergedLast14d: (weeklyVelocity[weeklyVelocity.length - 1] || 0) + (weeklyVelocity[weeklyVelocity.length - 2] || 0),
        prsMergedLast30d: weeklyVelocity.slice(-4).reduce((s, v) => s + v, 0),
        avgCycleTimeHours: avgCycleTime,
        cycleTimeVariance,
        prSizeMean: recentPRs.length > 0
          ? recentPRs.reduce((s, pr) => s + (pr.additions || 0) + (pr.deletions || 0), 0) / recentPRs.length
          : 0,
        reviewerCountPerPrMean: reviewerCounts.size > 0 ? (reviews?.length || 0) / recentPRs.length : 0,
        reviewConcentrationIndex: reviewerHHI,
        openPrCountTrend: 0, // Would need open PR data
        prsPerEngineer: uniqueEngineers > 0 ? recentPRs.length / uniqueEngineers : 0,
        jiraTicketsResolved7d: 0, // Would need Jira data
        jiraTicketCycleTimeHours: 0,
        velocityZScore: zScore,
        reviewerHHI,
        reviewerGini,
      };

      // Try ML prediction
      let prediction: VelocityPrediction | null = null;
      try {
        prediction = await predictVelocity(
          this.supabase,
          this.config.organizationId,
          featureVector,
        );
      } catch (err) {
        logger.warn(`Velocity prediction model failed: ${err}`);
      }

      return {
        currentVelocity,
        historicalMean: Math.round(historicalMean * 10) / 10,
        historicalStdDev: Math.round(historicalStdDev * 10) / 10,
        percentDrop: Math.round(percentDrop * 10) / 10,
        zScore: Math.round(zScore * 100) / 100,
        collapseDetected,
        collapseReason,
        confidence: Math.round(confidence * 100) / 100,
        prediction,
        featureVector,
      };
    },

    /**
     * Use Case 2: Bottleneck Concentration Risk
     *
     * Graph-based analysis of reviewer networks to identify:
     * - Single points of failure (bus factor)
     * - Review concentration (HHI, Gini)
     * - Network centrality (betweenness, eigenvector)
     *
     * BRS = 0.3*HHI + 0.25*gini + 0.25*max_betweenness + 0.2*top_reviewer_share
     *
     * High Risk if:
     * - Top 1 reviewer handles >40% of PRs
     * - OR HHI > 0.25
     * - OR Betweenness centrality z-score > 2
     */
    analyzeBottleneckRisk: async (options?: {
      lookbackDays?: number;
      domains?: string[];
    }): Promise<BottleneckRiskResult> => {
      const lookbackDays = options?.lookbackDays ?? 90;
      logger.info(`Analyzing bottleneck risk (lookback: ${lookbackDays}d)...`);

      const since = new Date();
      since.setDate(since.getDate() - lookbackDays);

      // Fetch review data
      const { data: reviews } = await this.supabase
        .from('pr_reviews')
        .select(`
          reviewer_login,
          review_submitted_at,
          review_state,
          pr_id,
          pr:pull_requests!inner(author_login, repo_id)
        `)
        .eq('organization_id', this.config.organizationId)
        .gte('review_submitted_at', since.toISOString());

      if (!reviews || reviews.length === 0) {
        return {
          topReviewer: 'N/A',
          reviewShare: 0,
          giniCoefficient: 0,
          hhi: 0,
          riskScore: 0,
          riskLevel: 'low',
          reviewerBreakdown: [],
          alerts: [],
          heatmap: {},
        };
      }

      // Build reviewer graph
      const reviewerCounts = new Map<string, number>();
      const reviewerLatencies = new Map<string, number[]>();
      const edges: Array<{ from: string; to: string }> = [];

      for (const review of reviews) {
        const reviewer = review.reviewer_login || 'unknown';
        reviewerCounts.set(reviewer, (reviewerCounts.get(reviewer) || 0) + 1);

        // Build graph edges: reviewer -> PR -> author
        const author = (review.pr as any)?.author_login;
        if (author && reviewer !== author) {
          edges.push({ from: reviewer, to: author });
        }
      }

      const totalReviews = reviews.length;
      const counts = [...reviewerCounts.values()];
      const sortedReviewers = [...reviewerCounts.entries()].sort((a, b) => b[1] - a[1]);

      // Concentration metrics
      const gini = calculateGiniCoefficient(counts);
      const hhi = calculateHHI(counts);
      const betweenness = calculateBetweennessCentrality(edges);

      // Top reviewer
      const topReviewer = sortedReviewers[0]?.[0] || 'N/A';
      const topReviewerCount = sortedReviewers[0]?.[1] || 0;
      const reviewShare = totalReviews > 0 ? topReviewerCount / totalReviews : 0;

      // BRS calculation (spec-compliant)
      const maxBetweenness = Math.max(...[...betweenness.values()], 0);
      const riskScore = (0.3 * hhi) + (0.25 * gini) + (0.25 * Math.min(maxBetweenness, 1)) + (0.2 * reviewShare);
      const riskLevel = getBRSRiskLevel(riskScore);

      // Reviewer breakdown
      const reviewerBreakdown = sortedReviewers.slice(0, 10).map(([reviewer, count]) => ({
        reviewer,
        reviewCount: count,
        share: Math.round((count / totalReviews) * 100) / 100,
        avgLatencyHours: 0, // Would need PR review timing data
        betweennessCentrality: betweenness.get(reviewer) || 0,
      }));

      // Generate alerts
      const alerts: Array<{ severity: string; message: string; actions: string[] }> = [];

      if (reviewShare > 0.4) {
        alerts.push({
          severity: 'critical',
          message: `${topReviewer} handles ${Math.round(reviewShare * 100)}% of all reviews (>40% threshold)`,
          actions: [
            'Distribute review load across more team members',
            'Add rotating review assignments',
            'Train additional reviewers in critical areas',
          ],
        });
      }

      if (hhi > 0.25) {
        alerts.push({
          severity: 'high',
          message: `Reviewer HHI = ${hhi.toFixed(3)} (>0.25 threshold indicates high concentration)`,
          actions: [
            'Implement review round-robin',
            'Create review ownership matrix',
          ],
        });
      }

      // Run brain-integrated bottleneck detection if data is in L1
      let heatmap: Record<string, number> = {};
      try {
        const domains = options?.domains || ['engineering'];
        heatmap = await getBottleneckHeatmap(
          { supabase: this.supabase, organizationId: this.config.organizationId, lookbackDays },
          domains,
        );
      } catch {
        heatmap = { engineering: riskScore };
      }

      return {
        topReviewer,
        reviewShare: Math.round(reviewShare * 100) / 100,
        giniCoefficient: Math.round(gini * 1000) / 1000,
        hhi: Math.round(hhi * 1000) / 1000,
        riskScore: Math.round(riskScore * 1000) / 1000,
        riskLevel,
        reviewerBreakdown,
        alerts,
        heatmap,
      };
    },

    /**
     * Combined early warning analysis — runs both velocity + bottleneck.
     */
    runEarlyWarning: async (options?: {
      lookbackDays?: number;
      domains?: string[];
    }): Promise<EarlyWarningReport> => {
      logger.info('Running full early warning analysis...');

      const report = await runEarlyWarningSystem({
        supabase: this.supabase,
        organizationId: this.config.organizationId,
        lookbackDays: options?.lookbackDays ?? 90,
        domains: options?.domains ?? ['engineering'],
      });

      const summary = getEarlyWarningSummary(report);
      logger.info(
        `Early Warning: Risk=${summary.riskLevel}, ` +
        `Bottlenecks=${summary.totalBottlenecks} (${summary.criticalBottlenecks} critical), ` +
        `Velocity at risk: ${summary.velocityRisk}`,
      );

      return report;
    },

    /**
     * Get velocity snapshots over time (for charting).
     */
    getVelocityTimeSeries: async (options?: {
      lookbackDays?: number;
      windowType?: 'sprint' | '7day' | '14day' | '30day';
    }): Promise<Array<{
      date: string;
      prs_merged: number;
      mean_cycle_time_hours: number;
      prs_per_engineer: number;
    }>> => {
      const since = new Date();
      since.setDate(since.getDate() - (options?.lookbackDays ?? 90));

      const { data } = await this.supabase
        .from('velocity_snapshots')
        .select('snapshot_date, prs_merged, mean_pr_cycle_time_hours, prs_per_engineer')
        .eq('organization_id', this.config.organizationId)
        .eq('window_type', options?.windowType ?? '7day')
        .gte('snapshot_date', since.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      return (data || []).map((s: any) => ({
        date: s.snapshot_date,
        prs_merged: s.prs_merged || 0,
        mean_cycle_time_hours: s.mean_pr_cycle_time_hours || 0,
        prs_per_engineer: s.prs_per_engineer || 0,
      }));
    },

    /**
     * Get bottleneck snapshots over time (for charting).
     */
    getBottleneckTimeSeries: async (options?: {
      lookbackDays?: number;
    }): Promise<Array<{
      date: string;
      top_reviewer_share: number;
      gini: number;
      hhi: number;
      risk_score: number;
      risk_level: string;
    }>> => {
      const since = new Date();
      since.setDate(since.getDate() - (options?.lookbackDays ?? 90));

      const { data } = await this.supabase
        .from('bottleneck_snapshots')
        .select('snapshot_date, top_reviewer_share, reviewer_gini_coefficient, reviewer_hhi, bottleneck_risk_score, risk_level')
        .eq('organization_id', this.config.organizationId)
        .gte('snapshot_date', since.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      return (data || []).map((s: any) => ({
        date: s.snapshot_date,
        top_reviewer_share: s.top_reviewer_share || 0,
        gini: s.reviewer_gini_coefficient || 0,
        hhi: s.reviewer_hhi || 0,
        risk_score: s.bottleneck_risk_score || 0,
        risk_level: s.risk_level || 'low',
      }));
    },
  };

  // ==========================================================================
  // P1: SOFTWARE ENGINEERING AI CAPABILITIES
  // ==========================================================================

  p1 = {
    // ── 1. DEVELOPMENT SPEED ──────────────────────────────────────────

    /**
     * P1.1: TDD Code Generation Agent
     * Accepts requirements → generates tests → writes code to pass them.
     */
    generateTDDCode: async (request: TDDCodeRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('tdd-code-generator', request);
    },

    /**
     * P1.2: Boilerplate & Scaffolding Generator
     * Generates project scaffolding following company standards.
     * Uses brain context to match existing codebase patterns.
     */
    generateBoilerplate: async (request: {
      projectType: string;
      language: string;
      features?: string[];
      template?: string;
    }): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('tdd-code-generator', {
        ...request,
        requirements: `Generate ${request.projectType} boilerplate with features: ${(request.features || []).join(', ')}`,
      });
    },

    /**
     * P1.3: PR Review & Iteration Assistant
     * Auto-reviews PRs for bugs, security, style, and test coverage.
     * Uses brain context (learned patterns, causal edges) to enrich review.
     */
    reviewPR: async (request: {
      diff: string;
      title?: string;
      description?: string;
      language?: string;
    }): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('impact-analysis', {
        changeType: 'code',
        description: request.title || 'PR Review',
        diff: request.diff,
        components: [],
        reviewMode: true,
      });
    },

    /**
     * P1.4: Dependency Upgrade Assistant
     * Identifies outdated deps, analyzes breaking changes, generates migration code.
     */
    analyzeDependencyUpgrades: async (request: DependencyUpgradeRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('dependency-upgrade', request);
    },

    /**
     * P1.5: HLD/LLD Document Generator
     * Forward: Requirements -> Design documents
     * Reverse: Code -> Design documents
     */
    generateDesignDoc: async (request: DesignDocRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('design-doc-generator', request);
    },

    // ── 2. DEVELOPMENT ACCURACY ───────────────────────────────────────

    /**
     * P1.2.1: Data Model Lineage Mapper [HIGH PRIORITY GAP]
     * Maps data flow: source -> transformations -> destination.
     * Detects orphan tables, circular dependencies, data quality risks.
     */
    mapDataLineage: async (request: DataLineageRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('data-lineage', request);
    },

    /**
     * P1.2.2: Impact Analysis Agent
     * Predicts ripple effects of code changes.
     * Uses brain's causal graph for cross-domain impact prediction.
     */
    analyzeImpact: async (request: ImpactAnalysisRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('impact-analysis', request);
    },

    /**
     * P1.2.3: SQL Query Analyzer
     * Checks correctness, performance, security of SQL queries.
     */
    analyzeSQL: async (request: SQLAnalysisRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('sql-analyzer', request);
    },

    // ── 3. PRODUCTION SUPPORT ─────────────────────────────────────────

    /**
     * P1.3.1: Log Query & Analysis Agent [HIGH PRIORITY GAP]
     * Natural language -> log query translation.
     * Correlates across services, identifies anomaly patterns.
     */
    queryLogs: async (request: LogQueryRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('log-query', request);
    },

    /**
     * P1.3.2: Incident Diagnosis Assistant [HIGH PRIORITY GAP]
     * Aggregates logs + metrics + traces to diagnose incidents.
     * Suggests root causes, remediations, and similar past incidents.
     */
    diagnoseIncident: async (request: IncidentDiagnosisRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('incident-diagnosis', request);
    },

    /**
     * P1.3.4: Performance Profiler
     * Identifies slow endpoints, bottleneck code, optimization strategies.
     */
    profilePerformance: async (request: PerformanceProfileRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('performance-profiler', request);
    },

    // ── 4. CODE UNDERSTANDING & MODERNIZATION ─────────────────────────

    /**
     * P1.4.1: Codebase Q&A Agent
     * Natural language questions about the codebase.
     * Uses brain's semantic memory + causal context for answers.
     */
    askCodebase: async (request: CodebaseQueryRequest): Promise<SeAaSJobResult> => {
      // Route through brain query for codebase-level questions
      try {
        const result = await this.brain.query(request.question, {
          domain: request.domain || 'engineering',
        });
        return {
          status: 'completed',
          result: {
            answer: result.answer,
            causalRelationships: result.causalRelationships,
            patterns: result.patterns,
          },
        };
      } catch {
        // Fallback to SE-aaS domain
        return this._executeSeAaS('tdd-code-generator', {
          requirements: request.question,
          language: 'typescript',
          mode: 'query',
        });
      }
    },

    /**
     * P1.4.2: Architecture Extractor
     * Parses codebase + infra configs to generate architecture diagrams.
     */
    extractArchitecture: async (request: {
      codebase?: string;
      infrastructure?: string;
      focusAreas?: string[];
    }): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('design-doc-generator', {
        docType: 'hld',
        requirements: 'Extract current architecture from codebase',
        existingCode: request.codebase,
        mode: 'reverse',
      });
    },

    /**
     * P1.4.3: Dead Code Detector
     * Identifies unreachable code, unused dependencies.
     */
    detectDeadCode: async (request: DeadCodeRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('dead-code-detector', request);
    },

    // ── 5. TESTING & QUALITY ──────────────────────────────────────────

    /**
     * P1.5.1: Test Case Generator
     * Generates unit, integration, and edge-case tests.
     * Uses Claude for quality + brain context for org-specific patterns.
     */
    generateTestCases: async (request: TestCaseRequest): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('test-case-generator', request);
    },

    /**
     * Generate test data fixtures matching production patterns.
     */
    generateTestData: async (request: {
      schema: string;
      count?: number;
      scenario?: string;
    }): Promise<SeAaSJobResult> => {
      return this._executeSeAaS('test-data-generator', request);
    },
  };

  // ==========================================================================
  // INTERNAL: SE-aaS Domain Executor
  // ==========================================================================

  private async _executeSeAaS(
    domainType: string,
    request: unknown,
  ): Promise<SeAaSJobResult> {
    const requestObj = request as Record<string, unknown>;
    const platformUrl = this.config.platformUrl || 'http://localhost:3000';

    // Map domain types to API routes
    const routeMap: Record<string, string> = {
      'test-data-generator': '/api/se-aas/test-data',
      'test-case-generator': '/api/se-aas/test-cases',
      'tdd-code-generator': '/api/se-aas/tdd',
      'sql-analyzer': '/api/se-aas/sql-analyze',
      'data-lineage': '/api/se-aas/lineage',
      'incident-diagnosis': '/api/se-aas/incident',
      'impact-analysis': '/api/se-aas/impact',
      'dead-code-detector': '/api/se-aas/dead-code',
      'log-query': '/api/se-aas/log-query',
      'dependency-upgrade': '/api/se-aas/dependency-upgrade',
      'design-doc-generator': '/api/se-aas/design-doc',
      'performance-profiler': '/api/se-aas/performance-profile',
    };

    const route = routeMap[domainType];
    if (!route) {
      throw new Error(`Unknown SE-aaS domain: ${domainType}`);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Pass Anthropic key for Claude-powered domains
      if (this.config.anthropicApiKey) {
        (requestObj as any).anthropicApiKey = this.config.anthropicApiKey;
      }

      const response = await fetch(`${platformUrl}${route}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...requestObj,
          organizationId: this.config.organizationId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SE-aaS ${domainType} failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Handle async jobs (returns jobId for polling)
      if (data.jobId) {
        return {
          jobId: data.jobId,
          status: 'queued',
          result: data,
          artifactId: data.artifactId,
        };
      }

      // Sync domain - direct result
      return {
        status: 'completed',
        result: data,
        artifactId: data.artifactId,
      };
    } catch (error: any) {
      return {
        status: 'failed',
        result: { error: error.message },
      };
    }
  }

  /**
   * Poll for async job completion (for P1 async domains).
   */
  async pollJob(
    jobId: string,
    options?: { maxWaitMs?: number; pollIntervalMs?: number },
  ): Promise<SeAaSJobResult> {
    const maxWait = options?.maxWaitMs ?? 120_000;
    const interval = options?.pollIntervalMs ?? 2_000;
    const platformUrl = this.config.platformUrl || 'http://localhost:3000';
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const response = await fetch(
        `${platformUrl}/api/se-aas/jobs/${jobId}?organizationId=${this.config.organizationId}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' || data.status === 'failed') {
          return {
            jobId,
            status: data.status,
            result: data.result || data,
            artifactId: data.artifactId,
          };
        }
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    return {
      jobId,
      status: 'failed',
      result: { error: `Job ${jobId} timed out after ${maxWait}ms` },
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Nexus Intelligence client connected to the Demo Org.
 *
 * Reads config from environment variables if not provided.
 *
 * @example
 * ```ts
 * const client = await createNexusIntelligenceClient()
 *
 * // P0: Check for velocity collapse
 * const velocity = await client.p0.analyzeVelocityCollapse()
 * console.log(`Collapse detected: ${velocity.collapseDetected}`)
 *
 * // P0: Check bottleneck risk
 * const bottleneck = await client.p0.analyzeBottleneckRisk()
 * console.log(`Risk level: ${bottleneck.riskLevel}`)
 *
 * // P1: Generate test cases
 * const tests = await client.p1.generateTestCases({
 *   sourceCode: 'function add(a, b) { return a + b; }',
 *   language: 'javascript',
 * })
 * ```
 */
export async function createNexusIntelligenceClient(
  config?: NexusIntelligenceConfig,
): Promise<NexusIntelligenceClient> {
  const supabaseUrl = config?.supabaseUrl || process.env.SUPABASE_URL || '';
  const supabaseKey =
    config?.supabaseKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  const organizationId = config?.organizationId || DEMO_ORG_ID;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase URL and key required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars, ' +
      'or pass supabaseUrl and supabaseKey in config.',
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const fullConfig: NexusIntelligenceConfig & { organizationId: string } = {
    supabaseUrl,
    supabaseKey,
    organizationId,
    anthropicApiKey: config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    githubToken: config?.githubToken || process.env.GITHUB_TOKEN,
    githubOwner: config?.githubOwner || process.env.GITHUB_OWNER,
    githubRepo: config?.githubRepo || process.env.GITHUB_REPO,
    jira: config?.jira,
    linearApiKey: config?.linearApiKey || process.env.LINEAR_API_KEY,
    platformUrl: config?.platformUrl || process.env.PLATFORM_URL || 'http://localhost:3000',
  };

  const client = new NexusIntelligenceClient(supabase, fullConfig);

  // Ensure org exists
  await client.ensureOrganization();

  logger.info(`Nexus Intelligence Client ready — Org: ${organizationId}`);
  return client;
}

// ============================================================================
// TEST HARNESS: Exercise ALL P0 + P1 Use Cases
// ============================================================================

/**
 * Run the full test harness to validate all use cases.
 *
 * Usage: tsx scripts/nexus-intelligence-client.ts
 */
async function runTestHarness() {
  console.log('\n' + '='.repeat(80));
  console.log('NEXUS INTELLIGENCE CLIENT — FULL TEST HARNESS');
  console.log('P0 + P1 Use Cases for Demo Org');
  console.log('='.repeat(80) + '\n');

  const client = await createNexusIntelligenceClient();

  const results: Array<{ useCase: string; status: string; details: string }> = [];

  // ── P0: VELOCITY COLLAPSE WARNING ───────────────────────────────────

  console.log('\n--- P0 Use Case 1: Deploy Velocity Collapse Warning ---\n');
  try {
    const velocity = await client.p0.analyzeVelocityCollapse({ lookbackDays: 90 });
    results.push({
      useCase: 'P0.1: Velocity Collapse',
      status: velocity.collapseDetected ? 'ALERT' : 'OK',
      details: `Velocity=${velocity.currentVelocity}, Mean=${velocity.historicalMean}, ` +
               `z=${velocity.zScore}, Drop=${velocity.percentDrop}%, ` +
               `Confidence=${velocity.confidence}` +
               (velocity.prediction ? `, Predicted=${velocity.prediction.predictedVelocity}` : ''),
    });
    console.log(`  Collapse Detected: ${velocity.collapseDetected}`);
    console.log(`  Current Velocity: ${velocity.currentVelocity} PRs/week`);
    console.log(`  Historical Mean: ${velocity.historicalMean}`);
    console.log(`  Z-Score: ${velocity.zScore}`);
    console.log(`  Confidence: ${velocity.confidence}`);
    if (velocity.prediction) {
      console.log(`  ML Prediction: ${velocity.prediction.predictedVelocity} PRs next week`);
      console.log(`  Collapse Probability: ${velocity.prediction.collapseProbability}`);
    }
  } catch (err: any) {
    results.push({ useCase: 'P0.1: Velocity Collapse', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P0: BOTTLENECK CONCENTRATION RISK ───────────────────────────────

  console.log('\n--- P0 Use Case 2: Bottleneck Concentration Risk ---\n');
  try {
    const bottleneck = await client.p0.analyzeBottleneckRisk({ lookbackDays: 90 });
    results.push({
      useCase: 'P0.2: Bottleneck Risk',
      status: bottleneck.riskLevel === 'high' || bottleneck.riskLevel === 'critical' ? 'ALERT' : 'OK',
      details: `Risk=${bottleneck.riskLevel} (${bottleneck.riskScore}), ` +
               `TopReviewer=${bottleneck.topReviewer} (${Math.round(bottleneck.reviewShare * 100)}%), ` +
               `HHI=${bottleneck.hhi}, Gini=${bottleneck.giniCoefficient}`,
    });
    console.log(`  Risk Level: ${bottleneck.riskLevel} (score: ${bottleneck.riskScore})`);
    console.log(`  Top Reviewer: ${bottleneck.topReviewer} (${Math.round(bottleneck.reviewShare * 100)}% of reviews)`);
    console.log(`  HHI: ${bottleneck.hhi} (>0.25 = high concentration)`);
    console.log(`  Gini: ${bottleneck.giniCoefficient}`);
    console.log(`  Alerts: ${bottleneck.alerts.length}`);
    for (const alert of bottleneck.alerts) {
      console.log(`    [${alert.severity}] ${alert.message}`);
    }
  } catch (err: any) {
    results.push({ useCase: 'P0.2: Bottleneck Risk', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P0: EARLY WARNING (COMBINED) ───────────────────────────────────

  console.log('\n--- P0 Combined: Early Warning System ---\n');
  try {
    const earlyWarning = await client.p0.runEarlyWarning();
    const summary = getEarlyWarningSummary(earlyWarning);
    results.push({
      useCase: 'P0: Early Warning',
      status: summary.riskLevel === 'critical' || summary.riskLevel === 'high' ? 'ALERT' : 'OK',
      details: `OverallRisk=${earlyWarning.overallRisk}, Level=${summary.riskLevel}, ` +
               `Bottlenecks=${summary.totalBottlenecks}`,
    });
    console.log(`  Overall Risk: ${earlyWarning.overallRisk}/100`);
    console.log(`  Risk Level: ${summary.riskLevel}`);
    console.log(`  Bottlenecks: ${summary.totalBottlenecks} (${summary.criticalBottlenecks} critical)`);
    console.log(`  Velocity at Risk: ${summary.velocityRisk}`);
  } catch (err: any) {
    results.push({ useCase: 'P0: Early Warning', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P1: DEVELOPMENT SPEED ──────────────────────────────────────────

  console.log('\n--- P1.1: TDD Code Generation ---\n');
  try {
    const tdd = await client.p1.generateTDDCode({
      requirements: 'Create a function that validates email addresses',
      language: 'typescript',
    });
    results.push({ useCase: 'P1.1: TDD Code Gen', status: tdd.status, details: `jobId=${tdd.jobId || 'sync'}` });
    console.log(`  Status: ${tdd.status}, JobId: ${tdd.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.1: TDD Code Gen', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.3: PR Review ---\n');
  try {
    const review = await client.p1.reviewPR({
      diff: '+ function handleAuth(token) { eval(token); }',
      title: 'Add authentication handler',
    });
    results.push({ useCase: 'P1.3: PR Review', status: review.status, details: `jobId=${review.jobId || 'sync'}` });
    console.log(`  Status: ${review.status}, JobId: ${review.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.3: PR Review', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.4: Dependency Upgrade ---\n');
  try {
    const deps = await client.p1.analyzeDependencyUpgrades({
      packageManager: 'npm',
      packageJson: '{"dependencies": {"react": "^17.0.0", "express": "^4.17.0"}}',
    });
    results.push({ useCase: 'P1.4: Dep Upgrade', status: deps.status, details: `jobId=${deps.jobId || 'sync'}` });
    console.log(`  Status: ${deps.status}, JobId: ${deps.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.4: Dep Upgrade', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.5: HLD/LLD Document Generator ---\n');
  try {
    const design = await client.p1.generateDesignDoc({
      requirements: 'Design a user authentication system with OAuth2 and JWT tokens',
      docType: 'hld',
    });
    results.push({ useCase: 'P1.5: Design Doc', status: design.status, details: `jobId=${design.jobId || 'sync'}` });
    console.log(`  Status: ${design.status}, JobId: ${design.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.5: Design Doc', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P1: DEVELOPMENT ACCURACY ───────────────────────────────────────

  console.log('\n--- P1.2.1: Data Model Lineage Mapper ---\n');
  try {
    const lineage = await client.p1.mapDataLineage({
      schema: `
        CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, team_id UUID REFERENCES teams(id));
        CREATE TABLE teams (id UUID PRIMARY KEY, name TEXT);
        CREATE TABLE pull_requests (id UUID, author_id UUID REFERENCES users(id), repo_id UUID);
      `,
    });
    results.push({ useCase: 'P1.2.1: Data Lineage', status: lineage.status, details: `jobId=${lineage.jobId || 'sync'}` });
    console.log(`  Status: ${lineage.status}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.2.1: Data Lineage', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.2.2: Impact Analysis ---\n');
  try {
    const impact = await client.p1.analyzeImpact({
      changeType: 'code',
      description: 'Refactoring the authentication middleware to use JWT instead of sessions',
      components: ['auth-middleware', 'user-service', 'api-gateway'],
    });
    results.push({ useCase: 'P1.2.2: Impact Analysis', status: impact.status, details: `jobId=${impact.jobId || 'sync'}` });
    console.log(`  Status: ${impact.status}, JobId: ${impact.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.2.2: Impact Analysis', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.2.3: SQL Query Analyzer ---\n');
  try {
    const sql = await client.p1.analyzeSQL({
      query: `SELECT u.*, COUNT(o.id) FROM users u
              LEFT JOIN orders o ON o.user_id = u.id
              WHERE u.status = 'active'
              GROUP BY u.id
              ORDER BY COUNT(o.id) DESC`,
      databaseType: 'postgresql',
    });
    results.push({ useCase: 'P1.2.3: SQL Analyzer', status: sql.status, details: `jobId=${sql.jobId || 'sync'}` });
    console.log(`  Status: ${sql.status}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.2.3: SQL Analyzer', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P1: PRODUCTION SUPPORT ─────────────────────────────────────────

  console.log('\n--- P1.3.1: Log Query Agent ---\n');
  try {
    const logs = await client.p1.queryLogs({
      query: 'Show me all errors for the authentication service in the last hour',
      services: ['auth-service', 'api-gateway'],
    });
    results.push({ useCase: 'P1.3.1: Log Query', status: logs.status, details: `jobId=${logs.jobId || 'sync'}` });
    console.log(`  Status: ${logs.status}, JobId: ${logs.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.3.1: Log Query', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.3.2: Incident Diagnosis ---\n');
  try {
    const incident = await client.p1.diagnoseIncident({
      description: 'Users unable to log in since 14:30 UTC. Auth service returning 500 errors.',
      severity: 'critical',
      affectedServices: ['auth-service', 'user-service'],
      logs: [
        '[14:30:01] ERROR auth-service: Connection refused to Redis cluster',
        '[14:30:02] ERROR auth-service: Session store unavailable, falling back',
        '[14:30:15] FATAL auth-service: Circuit breaker open for redis-sessions',
      ],
    });
    results.push({ useCase: 'P1.3.2: Incident Diagnosis', status: incident.status, details: `jobId=${incident.jobId || 'sync'}` });
    console.log(`  Status: ${incident.status}, JobId: ${incident.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.3.2: Incident Diagnosis', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.3.4: Performance Profiler ---\n');
  try {
    const perf = await client.p1.profilePerformance({
      endpoint: '/api/users',
      metrics: { p99_ms: 2500, p50_ms: 800, rps: 150 },
    });
    results.push({ useCase: 'P1.3.4: Perf Profiler', status: perf.status, details: `jobId=${perf.jobId || 'sync'}` });
    console.log(`  Status: ${perf.status}, JobId: ${perf.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.3.4: Perf Profiler', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P1: CODE UNDERSTANDING ─────────────────────────────────────────

  console.log('\n--- P1.4.1: Codebase Q&A ---\n');
  try {
    const qa = await client.p1.askCodebase({
      question: 'How does the causal discovery engine work?',
      domain: 'engineering',
    });
    results.push({ useCase: 'P1.4.1: Codebase Q&A', status: qa.status, details: 'via brain query' });
    console.log(`  Status: ${qa.status}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.4.1: Codebase Q&A', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.4.2: Architecture Extractor ---\n');
  try {
    const arch = await client.p1.extractArchitecture({
      focusAreas: ['authentication', 'data-pipeline'],
    });
    results.push({ useCase: 'P1.4.2: Arch Extractor', status: arch.status, details: `jobId=${arch.jobId || 'sync'}` });
    console.log(`  Status: ${arch.status}, JobId: ${arch.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.4.2: Arch Extractor', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  console.log('\n--- P1.4.3: Dead Code Detector ---\n');
  try {
    const dead = await client.p1.detectDeadCode({
      sourceCode: `
        export function usedFunction() { return 42; }
        function unusedHelper() { return 'never called'; }
        const UNUSED_CONSTANT = 'dead';
      `,
      language: 'typescript',
    });
    results.push({ useCase: 'P1.4.3: Dead Code', status: dead.status, details: `jobId=${dead.jobId || 'sync'}` });
    console.log(`  Status: ${dead.status}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.4.3: Dead Code', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── P1: TESTING & QUALITY ──────────────────────────────────────────

  console.log('\n--- P1.5.1: Test Case Generator ---\n');
  try {
    const tests = await client.p1.generateTestCases({
      sourceCode: `
        export function calculateDiscount(price: number, tier: 'gold' | 'silver' | 'bronze'): number {
          if (price <= 0) throw new Error('Price must be positive');
          const rates = { gold: 0.20, silver: 0.10, bronze: 0.05 };
          return price * rates[tier];
        }
      `,
      language: 'typescript',
      framework: 'vitest',
      testTypes: ['unit', 'edge-case'],
    });
    results.push({ useCase: 'P1.5.1: Test Cases', status: tests.status, details: `jobId=${tests.jobId || 'sync'}` });
    console.log(`  Status: ${tests.status}, JobId: ${tests.jobId || 'N/A'}`);
  } catch (err: any) {
    results.push({ useCase: 'P1.5.1: Test Cases', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── BRAIN HEALTH ───────────────────────────────────────────────────

  console.log('\n--- Brain Health Check ---\n');
  try {
    const health = await client.brain.getHealth();
    results.push({
      useCase: 'Brain Health',
      status: 'OK',
      details: `Signals=${health.signalCount}, Relations=${health.relationshipCount}, ` +
               `Patterns=${health.patternCount}, Accuracy=${health.predictionAccuracy}`,
    });
    console.log(`  Signals: ${health.signalCount}`);
    console.log(`  Causal Relationships: ${health.relationshipCount}`);
    console.log(`  Patterns: ${health.patternCount}`);
    console.log(`  Prediction Accuracy: ${health.predictionAccuracy}`);
    console.log(`  Last Consolidation: ${health.lastConsolidation || 'never'}`);
  } catch (err: any) {
    results.push({ useCase: 'Brain Health', status: 'ERROR', details: err.message });
    console.log(`  Error: ${err.message}`);
  }

  // ── SUMMARY ────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80));
  console.log('TEST HARNESS RESULTS');
  console.log('='.repeat(80));
  console.log('');

  const maxNameLen = Math.max(...results.map((r) => r.useCase.length));
  for (const r of results) {
    const statusIcon = r.status === 'OK' || r.status === 'completed' || r.status === 'queued'
      ? '\u2705'
      : r.status === 'ALERT'
      ? '\u26A0\uFE0F'
      : '\u274C';
    console.log(
      `  ${statusIcon} ${r.useCase.padEnd(maxNameLen + 2)} [${r.status.padEnd(9)}] ${r.details}`,
    );
  }

  const passed = results.filter(
    (r) => r.status === 'OK' || r.status === 'completed' || r.status === 'queued' || r.status === 'ALERT',
  ).length;
  const failed = results.filter((r) => r.status === 'ERROR' || r.status === 'failed').length;

  console.log('');
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
  runTestHarness().catch((err) => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
}

/**
 * CTO Brain Performance Tracker — Executive Meta-Cognition Dashboard
 * ===================================================================
 *
 * Brain Analog: The Prefrontal Cortex in its executive monitoring mode.
 * Just as a CTO reviews system health dashboards, architectural fitness,
 * and engineering velocity, this module provides a CTO-grade view of
 * the brain's performance across ALL dimensions:
 *
 *   - Knowledge Growth: How much is the brain learning? (new edges, packs, books)
 *   - Prediction Accuracy: Is the brain getting smarter? (calibration over time)
 *   - Learning Velocity: How fast is knowledge being ingested? (signals/day)
 *   - Brain Maturity Score: Overall intelligence metric (0-100)
 *   - Knowledge Coverage: Which domains are well-understood vs sparse?
 *   - Evolution Trajectory: Is the brain on an upward or plateau trajectory?
 *
 * This is the CTO's "brain dashboard" — tracking the brain like you'd
 * track an engineering org's DORA metrics.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/** A single day's brain performance snapshot for time-series tracking */
export interface DailyBrainMetrics {
  date: string;
  /** Total causal edges in the graph */
  totalEdges: number;
  /** New edges discovered today */
  newEdges: number;
  /** Edges pruned (removed as weak/stale) */
  edgesPruned: number;
  /** Edges strengthened by verified predictions */
  edgesStrengthened: number;
  /** Edges decayed due to staleness */
  edgesDecayed: number;
  /** Signals processed today */
  signalsProcessed: number;
  /** Anomalies detected */
  anomaliesDetected: number;
  /** Patterns discovered */
  patternsFound: number;
  /** Prediction accuracy (0-100) */
  predictionAccuracy: number;
  /** Memories created (LLM-distilled insights) */
  memoriesCreated: number;
  /** Active brain regions during consolidation */
  regionsActive: string[];
  /** Consolidation duration in ms */
  runDurationMs: number;
  /** Run status */
  runStatus: string;
}

/** Knowledge coverage breakdown by domain */
export interface DomainCoverage {
  domain: string;
  /** Edges where this domain is source or target */
  edgeCount: number;
  /** Unique signals from this domain */
  signalCount: number;
  /** Average edge confidence in this domain */
  avgConfidence: number;
  /** Whether domain has data from last 7 days */
  isActive: boolean;
  /** Number of training packs covering this domain */
  trainingPacks: number;
  /** Coverage grade: A-F */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/** Learning velocity: rate of knowledge acquisition */
export interface LearningVelocity {
  /** Signals per day (7-day rolling average) */
  signalsPerDay: number;
  /** Edges per day (7-day rolling average) */
  edgesPerDay: number;
  /** Predictions per day */
  predictionsPerDay: number;
  /** Books/articles ingested per cycle */
  knowledgeSourcesPerCycle: number;
  /** Trend direction */
  trend: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
  /** Velocity score (0-100) */
  velocityScore: number;
}

/** Brain maturity assessment */
export interface BrainMaturityScore {
  /** Overall maturity (0-100) */
  overall: number;
  /** Sub-scores */
  dimensions: {
    /** Causal graph completeness: do we have edges across all domain pairs? */
    graphCompleteness: number;
    /** Prediction accuracy across all tracked outcomes */
    predictionAccuracy: number;
    /** Learning velocity: how fast are we growing? */
    learningVelocity: number;
    /** Knowledge diversity: coverage across domains */
    knowledgeDiversity: number;
    /** Calibration quality: ECE-based (lower = better → higher score) */
    calibrationQuality: number;
    /** Self-improvement: is accuracy improving over time? */
    improvementTrajectory: number;
  };
  /** Maturity stage label */
  stage: 'infant' | 'toddler' | 'adolescent' | 'adult' | 'expert';
  /** Natural language assessment */
  narrative: string;
}

/** Knowledge evolution over time — for tracking trajectory */
export interface EvolutionTrajectory {
  /** Time window analyzed */
  windowDays: number;
  /** Direction */
  direction: 'growing' | 'plateau' | 'declining';
  /** Weekly growth rate for key metrics */
  weeklyGrowthRates: {
    edges: number;
    accuracy: number;
    signals: number;
    domains: number;
  };
  /** Projected maturity at current rate (days to next stage) */
  daysToNextStage: number | null;
  /** Areas needing attention */
  bottlenecks: string[];
  /** Recommended actions */
  recommendations: string[];
}

/** Book/knowledge source tracking */
export interface KnowledgeSourceMetrics {
  /** Source name (e.g., 'arxiv', 'openlibrary', 'wikipedia') */
  source: string;
  /** Total items ingested from this source */
  totalIngested: number;
  /** Items ingested in last 7 days */
  recentIngested: number;
  /** Causal patterns extracted */
  patternsExtracted: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Last ingestion timestamp */
  lastIngestedAt: string | null;
}

/** Complete CTO Performance Report */
export interface CTOPerformanceReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Organization */
  organizationId: string;

  /** Brain Maturity Score — the headline number */
  maturity: BrainMaturityScore;

  /** Daily metrics for time-series charting (last N days) */
  dailyMetrics: DailyBrainMetrics[];

  /** Domain coverage map */
  domainCoverage: DomainCoverage[];

  /** Learning velocity */
  velocity: LearningVelocity;

  /** Evolution trajectory */
  trajectory: EvolutionTrajectory;

  /** Knowledge source metrics */
  knowledgeSources: KnowledgeSourceMetrics[];

  /** Top-level KPIs for quick glance */
  kpis: {
    totalEdges: number;
    predictionAccuracy: number;
    domainsActive: number;
    signalsLast7Days: number;
    booksIngested: number;
    brainAgeInDays: number;
    consolidationRuns: number;
  };

  /** Executive narrative */
  narrative: string;
}

/** Config for the CTO Performance Tracker */
export interface CTOTrackerConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** How many days of history to include (default: 30) */
  historyDays?: number;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function maturityStage(score: number): 'infant' | 'toddler' | 'adolescent' | 'adult' | 'expert' {
  if (score >= 85) return 'expert';
  if (score >= 65) return 'adult';
  if (score >= 45) return 'adolescent';
  if (score >= 25) return 'toddler';
  return 'infant';
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ============================================================================
// CTO PERFORMANCE TRACKER FACTORY
// ============================================================================

/**
 * Create a CTO Performance Tracker for executive-level brain monitoring.
 *
 * Brain Analog: The brain's executive monitoring system — the prefrontal
 * cortex continuously monitors performance across all regions and
 * determines whether cognitive function is improving, stable, or degrading.
 *
 * @param config - Tracker configuration
 * @returns CTO Performance Tracker instance
 */
export function createCTOPerformanceTracker(config: CTOTrackerConfig) {
  const {
    supabase,
    organizationId,
    historyDays = 30,
    verbose = false,
  } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[CTO-Tracker]', ...args)
    : () => {};

  // ── Fetch Daily Snapshots ──────────────────────────────────────

  async function fetchDailySnapshots(): Promise<DailyBrainMetrics[]> {
    const since = new Date();
    since.setDate(since.getDate() - historyDays);

    const { data, error } = await supabase
      .from('brain_daily_snapshots')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('snapshot_date', since.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });

    if (error || !data) {
      log('Failed to fetch daily snapshots:', error?.message);
      return [];
    }

    return data.map((row: Record<string, unknown>) => ({
      date: String(row.snapshot_date || ''),
      totalEdges: Number(row.total_connections || 0),
      newEdges: Number(row.new_connections || 0),
      edgesPruned: Number(row.edges_pruned || 0),
      edgesStrengthened: Number(row.edges_strengthened || 0),
      edgesDecayed: Number(row.edges_decayed || 0),
      signalsProcessed: Number(row.signals_processed || 0),
      anomaliesDetected: Number(row.anomalies_detected || 0),
      patternsFound: Number(row.patterns_found || 0),
      predictionAccuracy: Number(row.prediction_accuracy || 0),
      memoriesCreated: Number(row.memories_created || 0),
      regionsActive: (row.regions_active as string[]) || [],
      runDurationMs: Number(row.run_duration_ms || 0),
      runStatus: String(row.run_status || 'unknown'),
    }));
  }

  // ── Domain Coverage Analysis ──────────────────────────────────

  async function analyzeDomainCoverage(): Promise<DomainCoverage[]> {
    // Get all causal edges grouped by domain
    const { data: edges } = await supabase
      .from('causal_edges')
      .select('source_domain, target_domain, confidence')
      .eq('organization_id', organizationId);

    // Get signal counts per domain (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: signals } = await supabase
      .from('cross_domain_signals')
      .select('source_domain')
      .eq('organization_id', organizationId)
      .gte('signal_timestamp', weekAgo.toISOString());

    // Aggregate
    const domainMap = new Map<string, {
      edgeCount: number;
      signalCount: number;
      confidences: number[];
    }>();

    const allEdges = edges || [];
    for (const edge of allEdges) {
      const src = String(edge.source_domain || '').toLowerCase();
      const tgt = String(edge.target_domain || '').toLowerCase();
      const conf = Number(edge.confidence || 0);

      for (const d of [src, tgt]) {
        if (!d) continue;
        if (!domainMap.has(d)) domainMap.set(d, { edgeCount: 0, signalCount: 0, confidences: [] });
        const entry = domainMap.get(d)!;
        entry.edgeCount++;
        entry.confidences.push(conf);
      }
    }

    const allSignals = signals || [];
    for (const sig of allSignals) {
      const d = String(sig.source_domain || '').toLowerCase();
      if (!d) continue;
      if (!domainMap.has(d)) domainMap.set(d, { edgeCount: 0, signalCount: 0, confidences: [] });
      domainMap.get(d)!.signalCount++;
    }

    const coverages: DomainCoverage[] = [];
    for (const [domain, stats] of domainMap) {
      const avgConf = stats.confidences.length > 0
        ? stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length
        : 0;

      // Score: weighted combo of edges + signals + confidence
      const edgeScore = Math.min(stats.edgeCount / 10, 1) * 40;
      const signalScore = Math.min(stats.signalCount / 100, 1) * 30;
      const confScore = avgConf * 30;
      const totalScore = edgeScore + signalScore + confScore;

      coverages.push({
        domain,
        edgeCount: stats.edgeCount,
        signalCount: stats.signalCount,
        avgConfidence: Math.round(avgConf * 100) / 100,
        isActive: stats.signalCount > 0,
        trainingPacks: 0, // Populated separately if needed
        grade: gradeFromScore(totalScore),
      });
    }

    return coverages.sort((a, b) => b.edgeCount - a.edgeCount);
  }

  // ── Learning Velocity ─────────────────────────────────────────

  function computeVelocity(snapshots: DailyBrainMetrics[]): LearningVelocity {
    if (snapshots.length === 0) {
      return {
        signalsPerDay: 0,
        edgesPerDay: 0,
        predictionsPerDay: 0,
        knowledgeSourcesPerCycle: 0,
        trend: 'stalled',
        velocityScore: 0,
      };
    }

    // Last 7 days for rolling average
    const recent = snapshots.slice(-7);
    const signalsPerDay = recent.reduce((sum, d) => sum + d.signalsProcessed, 0) / recent.length;
    const edgesPerDay = recent.reduce((sum, d) => sum + d.newEdges, 0) / recent.length;
    const predictionsPerDay = recent.reduce((sum, d) => sum + d.memoriesCreated, 0) / recent.length;

    // Trend: compare last 7 vs previous 7
    const older = snapshots.slice(-14, -7);
    let trend: LearningVelocity['trend'] = 'steady';
    if (older.length > 0) {
      const olderSignals = older.reduce((sum, d) => sum + d.signalsProcessed, 0) / older.length;
      const ratio = olderSignals > 0 ? signalsPerDay / olderSignals : 1;
      if (ratio > 1.2) trend = 'accelerating';
      else if (ratio < 0.8) trend = 'decelerating';
      else if (signalsPerDay === 0) trend = 'stalled';
    }

    // Velocity score: signals + edges + predictions
    const velocityScore = clamp(
      (Math.min(signalsPerDay / 500, 1) * 40) +
      (Math.min(edgesPerDay / 10, 1) * 30) +
      (Math.min(predictionsPerDay / 5, 1) * 30),
      0, 100
    );

    return {
      signalsPerDay: Math.round(signalsPerDay),
      edgesPerDay: Math.round(edgesPerDay * 10) / 10,
      predictionsPerDay: Math.round(predictionsPerDay * 10) / 10,
      knowledgeSourcesPerCycle: 0, // Updated when book ingestion is wired
      trend,
      velocityScore: Math.round(velocityScore),
    };
  }

  // ── Brain Maturity Score ──────────────────────────────────────

  function computeMaturity(
    snapshots: DailyBrainMetrics[],
    coverage: DomainCoverage[],
    velocity: LearningVelocity,
  ): BrainMaturityScore {
    const latest = snapshots[snapshots.length - 1];

    // 1. Graph Completeness: edges across domain pairs
    const totalEdges = latest?.totalEdges || 0;
    const graphCompleteness = clamp(Math.log2(totalEdges + 1) / Math.log2(200) * 100, 0, 100);

    // 2. Prediction Accuracy: direct from latest snapshot
    const predictionAccuracy = latest?.predictionAccuracy || 0;

    // 3. Learning Velocity
    const learningVelocity = velocity.velocityScore;

    // 4. Knowledge Diversity: how many domains have grade B or above
    const totalDomains = coverage.length;
    const healthyDomains = coverage.filter(d => d.grade === 'A' || d.grade === 'B').length;
    const knowledgeDiversity = totalDomains > 0
      ? clamp((healthyDomains / Math.max(totalDomains, 8)) * 100, 0, 100)
      : 0;

    // 5. Calibration Quality: lower ECE → higher score
    // (We use prediction accuracy as proxy here — full ECE needs monitor)
    const calibrationQuality = clamp(predictionAccuracy, 0, 100);

    // 6. Improvement Trajectory: compare first half vs second half
    const mid = Math.floor(snapshots.length / 2);
    const firstHalf = snapshots.slice(0, mid);
    const secondHalf = snapshots.slice(mid);
    const firstAvgAcc = firstHalf.length > 0
      ? firstHalf.reduce((s, d) => s + d.predictionAccuracy, 0) / firstHalf.length
      : 0;
    const secondAvgAcc = secondHalf.length > 0
      ? secondHalf.reduce((s, d) => s + d.predictionAccuracy, 0) / secondHalf.length
      : 0;
    const improvementTrajectory = clamp(
      50 + (secondAvgAcc - firstAvgAcc) * 5, // 10% improvement → 100
      0, 100
    );

    // Weighted overall score
    const overall = Math.round(
      graphCompleteness * 0.15 +
      predictionAccuracy * 0.25 +
      learningVelocity * 0.15 +
      knowledgeDiversity * 0.15 +
      calibrationQuality * 0.15 +
      improvementTrajectory * 0.15
    );

    const stage = maturityStage(overall);

    const stageNarrative: Record<string, string> = {
      infant: 'The brain is in its earliest stage — building foundational connections. Focus on ingesting diverse data sources.',
      toddler: 'The brain is developing basic causal understanding. Knowledge is growing but needs more verification cycles.',
      adolescent: 'The brain has meaningful causal models and is learning from predictions. Accuracy is improving.',
      adult: 'The brain has mature causal graphs with validated predictions. It can reliably forecast cross-domain effects.',
      expert: 'The brain has deep, well-calibrated knowledge across multiple domains with high prediction accuracy.',
    };

    return {
      overall,
      dimensions: {
        graphCompleteness: Math.round(graphCompleteness),
        predictionAccuracy: Math.round(predictionAccuracy),
        learningVelocity: Math.round(learningVelocity),
        knowledgeDiversity: Math.round(knowledgeDiversity),
        calibrationQuality: Math.round(calibrationQuality),
        improvementTrajectory: Math.round(improvementTrajectory),
      },
      stage,
      narrative: stageNarrative[stage],
    };
  }

  // ── Evolution Trajectory ──────────────────────────────────────

  function computeTrajectory(
    snapshots: DailyBrainMetrics[],
    coverage: DomainCoverage[],
    maturity: BrainMaturityScore,
  ): EvolutionTrajectory {
    // Compute weekly growth rates
    const recent7 = snapshots.slice(-7);
    const prev7 = snapshots.slice(-14, -7);

    function weeklyRate(recentFn: (d: DailyBrainMetrics) => number, prevFn: (d: DailyBrainMetrics) => number): number {
      const recentAvg = recent7.length > 0 ? recent7.reduce((s, d) => s + recentFn(d), 0) / recent7.length : 0;
      const prevAvg = prev7.length > 0 ? prev7.reduce((s, d) => s + prevFn(d), 0) / prev7.length : 0;
      if (prevAvg === 0) return recentAvg > 0 ? 100 : 0;
      return Math.round(((recentAvg - prevAvg) / prevAvg) * 100);
    }

    const edgesGrowth = weeklyRate(d => d.newEdges, d => d.newEdges);
    const accuracyGrowth = weeklyRate(d => d.predictionAccuracy, d => d.predictionAccuracy);
    const signalsGrowth = weeklyRate(d => d.signalsProcessed, d => d.signalsProcessed);
    const domainGrowth = 0; // Domain count doesn't change rapidly

    const avgGrowth = (edgesGrowth + accuracyGrowth + signalsGrowth) / 3;
    const direction: EvolutionTrajectory['direction'] =
      avgGrowth > 5 ? 'growing' : avgGrowth < -5 ? 'declining' : 'plateau';

    // Bottleneck detection
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    if (maturity.dimensions.graphCompleteness < 40) {
      bottlenecks.push('Causal graph is sparse — not enough edges discovered');
      recommendations.push('Ingest more data sources: connect Stripe, HubSpot, Jira, and other connectors');
    }
    if (maturity.dimensions.predictionAccuracy < 50) {
      bottlenecks.push('Prediction accuracy is below 50% — brain needs more feedback loops');
      recommendations.push('Record more prediction outcomes via the outcome tracker');
    }
    if (maturity.dimensions.knowledgeDiversity < 40) {
      bottlenecks.push('Knowledge is concentrated in few domains');
      recommendations.push('Ingest books and training packs covering underrepresented domains');
    }
    if (maturity.dimensions.learningVelocity < 30) {
      bottlenecks.push('Learning velocity is low — brain is not ingesting enough data');
      recommendations.push('Run consolidation more frequently or add more data connectors');
    }

    // Sparse domain recommendations
    const sparseDomains = coverage.filter(d => d.grade === 'D' || d.grade === 'F');
    if (sparseDomains.length > 0) {
      bottlenecks.push(`${sparseDomains.length} domains have poor coverage: ${sparseDomains.map(d => d.domain).join(', ')}`);
      recommendations.push('Focus book ingestion on: ' + sparseDomains.map(d => d.domain).join(', '));
    }

    // Time to next stage
    let daysToNextStage: number | null = null;
    const stageThresholds = { infant: 25, toddler: 45, adolescent: 65, adult: 85, expert: 100 };
    const currentThreshold = stageThresholds[maturity.stage];
    if (maturity.stage !== 'expert' && avgGrowth > 0) {
      const pointsNeeded = currentThreshold - maturity.overall;
      const pointsPerWeek = avgGrowth * 0.5; // Rough conversion
      if (pointsPerWeek > 0) {
        daysToNextStage = Math.round((pointsNeeded / pointsPerWeek) * 7);
      }
    }

    return {
      windowDays: historyDays,
      direction,
      weeklyGrowthRates: {
        edges: edgesGrowth,
        accuracy: accuracyGrowth,
        signals: signalsGrowth,
        domains: domainGrowth,
      },
      daysToNextStage,
      bottlenecks,
      recommendations,
    };
  }

  // ── Knowledge Source Metrics ───────────────────────────────────

  async function fetchKnowledgeSourceMetrics(): Promise<KnowledgeSourceMetrics[]> {
    // Query learning_runs table for different source types
    const { data: runs } = await supabase
      .from('learning_runs')
      .select('run_type, status, metrics, created_at')
      .in('run_type', ['public_data', 'trainer', 'book_ingestion', 'arxiv', 'openlibrary'])
      .order('created_at', { ascending: false })
      .limit(100);

    const sourceMap = new Map<string, KnowledgeSourceMetrics>();

    const defaultSources = ['wikipedia', 'fred', 'worldbank', 'hackernews', 'arxiv', 'openlibrary', 'github'];
    for (const s of defaultSources) {
      sourceMap.set(s, {
        source: s,
        totalIngested: 0,
        recentIngested: 0,
        patternsExtracted: 0,
        qualityScore: 0,
        lastIngestedAt: null,
      });
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const run of (runs || [])) {
      const runType = String(run.run_type);
      const metrics = (run.metrics || {}) as Record<string, unknown>;
      const createdAt = String(run.created_at || '');
      const isRecent = new Date(createdAt) > weekAgo;

      // Map run_type to source name
      let sourceName = runType;
      if (runType === 'public_data') sourceName = 'public_apis';
      if (runType === 'trainer') sourceName = 'training_library';

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          source: sourceName,
          totalIngested: 0,
          recentIngested: 0,
          patternsExtracted: 0,
          qualityScore: 0,
          lastIngestedAt: null,
        });
      }

      const entry = sourceMap.get(sourceName)!;
      const signalCount = Number(metrics.signals_processed || metrics.totalSignals || 0);
      entry.totalIngested += signalCount;
      if (isRecent) entry.recentIngested += signalCount;
      entry.patternsExtracted += Number(metrics.patterns_extracted || metrics.patternsFound || 0);
      if (!entry.lastIngestedAt || createdAt > entry.lastIngestedAt) {
        entry.lastIngestedAt = createdAt;
      }
    }

    return Array.from(sourceMap.values());
  }

  // ── Generate Narrative ────────────────────────────────────────

  function generateNarrative(
    maturity: BrainMaturityScore,
    velocity: LearningVelocity,
    trajectory: EvolutionTrajectory,
    kpis: CTOPerformanceReport['kpis'],
  ): string {
    const lines: string[] = [];

    lines.push(`**Brain Maturity: ${maturity.overall}/100 (${maturity.stage})**`);
    lines.push('');

    // Headline stats
    lines.push(`The brain has ${kpis.totalEdges} causal edges across ${kpis.domainsActive} active domains, `
      + `processing ~${velocity.signalsPerDay} signals/day with ${kpis.predictionAccuracy}% prediction accuracy.`);
    lines.push('');

    // Trajectory
    if (trajectory.direction === 'growing') {
      lines.push(`📈 The brain is actively growing. Edges are increasing ${trajectory.weeklyGrowthRates.edges}% week-over-week.`);
    } else if (trajectory.direction === 'plateau') {
      lines.push(`📊 The brain is in a stable plateau. To break through, consider adding new knowledge sources.`);
    } else {
      lines.push(`📉 Brain metrics are declining. Review data pipeline health and consolidation runs.`);
    }

    if (trajectory.daysToNextStage !== null) {
      lines.push(`At current velocity, estimated ${trajectory.daysToNextStage} days to reach "${maturity.stage === 'infant' ? 'toddler' : maturity.stage === 'toddler' ? 'adolescent' : maturity.stage === 'adolescent' ? 'adult' : 'expert'}" stage.`);
    }

    // Bottlenecks
    if (trajectory.bottlenecks.length > 0) {
      lines.push('');
      lines.push('**Bottlenecks:**');
      for (const b of trajectory.bottlenecks.slice(0, 3)) {
        lines.push(`  ⚠️ ${b}`);
      }
    }

    // Recommendations
    if (trajectory.recommendations.length > 0) {
      lines.push('');
      lines.push('**Recommended Actions:**');
      for (const r of trajectory.recommendations.slice(0, 3)) {
        lines.push(`  → ${r}`);
      }
    }

    return lines.join('\n');
  }

  // ── Main Report Generator ─────────────────────────────────────

  /**
   * Generate a complete CTO Performance Report.
   *
   * Brain Analog: This is the brain's self-assessment — like a CEO
   * reviewing their company's quarterly performance across all KPIs.
   */
  async function generateReport(): Promise<CTOPerformanceReport> {
    log('Generating CTO Performance Report...');

    // Fetch all data in parallel
    const [snapshots, coverage, knowledgeSources] = await Promise.all([
      fetchDailySnapshots(),
      analyzeDomainCoverage(),
      fetchKnowledgeSourceMetrics(),
    ]);

    // Compute derived metrics
    const velocity = computeVelocity(snapshots);
    const maturity = computeMaturity(snapshots, coverage, velocity);
    const trajectory = computeTrajectory(snapshots, coverage, maturity);

    // Build KPIs
    const latest = snapshots[snapshots.length - 1];
    const last7 = snapshots.slice(-7);
    const kpis = {
      totalEdges: latest?.totalEdges || 0,
      predictionAccuracy: Math.round(latest?.predictionAccuracy || 0),
      domainsActive: coverage.filter(d => d.isActive).length,
      signalsLast7Days: last7.reduce((s, d) => s + d.signalsProcessed, 0),
      booksIngested: knowledgeSources.reduce((s, k) => s + k.totalIngested, 0),
      brainAgeInDays: snapshots.length,
      consolidationRuns: snapshots.filter(d => d.runStatus === 'completed').length,
    };

    const narrative = generateNarrative(maturity, velocity, trajectory, kpis);

    const report: CTOPerformanceReport = {
      generatedAt: new Date().toISOString(),
      organizationId,
      maturity,
      dailyMetrics: snapshots,
      domainCoverage: coverage,
      velocity,
      trajectory,
      knowledgeSources,
      kpis,
      narrative,
    };

    log(`Report generated: Maturity ${maturity.overall}/100 (${maturity.stage})`);
    return report;
  }

  // ── Quick Health Check ────────────────────────────────────────

  /**
   * Quick health check — a fast ping that returns just the maturity score.
   * Use for dashboards that need frequent updates without full report.
   */
  async function quickCheck(): Promise<{
    maturityScore: number;
    stage: string;
    velocity: string;
    direction: string;
  }> {
    const snapshots = await fetchDailySnapshots();
    const velocity = computeVelocity(snapshots);

    const maturity = computeMaturity(snapshots, [], velocity);

    return {
      maturityScore: maturity.overall,
      stage: maturity.stage,
      velocity: velocity.trend,
      direction: snapshots.length > 1 ? 'active' : 'waiting',
    };
  }

  return {
    generateReport,
    quickCheck,
    fetchDailySnapshots,
    analyzeDomainCoverage,
    computeVelocity,
    computeMaturity,
  };
}

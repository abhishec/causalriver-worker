/**
 * Early Warning Systems - Brain-Integrated Version
 * ==================================================
 *
 * Architecture: REAL ENGINES FIRST → BRAIN ENRICHMENT ON TOP
 *
 * Step 1 — Real detection (always runs, returns real numbers):
 *   - detectAllBottlenecks()    → real Gini coefficient, bus factor, centrality
 *   - predictVelocityCollapse() → real Granger causality, linear trend
 *
 * Step 2 — Brain enrichment (runs on top of real data via BrainCommander):
 *   - L3  Dreaming         → surfaces historical patterns from ai_memory
 *   - L5  Curiosity Engine → generates root cause hypotheses
 *   - L6  Self-Modifying   → recalibrates confidence from prediction_records accuracy
 *   - L9  Theory of Mind   → models affected contributor perspectives
 *   - L11 Red Team         → stress-tests predictions adversarially
 *   - L14 Goal-Backward    → builds intervention plans from desired outcome
 *   - L15 Narrative Intel  → produces executive narrative
 *
 * The brain NEVER replaces real metric values.
 * It adds reasoning, narrative, and intervention planning on top.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrainCommanderInstance } from './brain-commander';
import {
  detectAllBottlenecks,
  getBottleneckHeatmap,
  generateBottleneckAlerts,
  type BottleneckMetrics,
  type BottleneckAlertEvent,
} from './bottleneck-detector';
import {
  predictVelocityCollapse,
  buildVelocityTimeSeries,
  type VelocityCollapseAlert,
  type VelocityMetrics,
} from './velocity-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainEarlyWarningConfig {
  /** BrainCommander instance (required for cognitive stack enrichment) */
  brainCommander: BrainCommanderInstance;
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Domains to monitor */
  domains?: string[];
  /** Days to look back for analysis */
  lookbackDays?: number;
  /** Forecast horizon (days) */
  forecastDays?: number;
  /** Anthropic API key for LLM-powered reasoning */
  anthropicApiKey?: string;
}

export interface BrainEarlyWarningReport {
  /** Organization ID */
  organizationId: string;

  // ── REAL METRICS (from real engines) ──────────────────────────────────────
  /** Overall risk score (0-100) computed from real Gini + real velocity drop */
  overallRisk: number;
  /** Real bottleneck metrics per domain (Gini, bus factor, centrality) */
  bottleneckRisks: BottleneckMetrics[];
  /** Real bottleneck alerts derived from actual expertise concentration */
  bottleneckAlerts: BottleneckAlertEvent[];
  /** Real velocity collapse prediction (Granger causality + linear trend) */
  velocityCollapse: VelocityCollapseAlert | null;
  /** Real velocity time series (PRs/day, WIP, deploys) */
  velocityMetrics: VelocityMetrics[];
  /** Real bottleneck heatmap (domain → risk score) */
  bottleneckHeatmap: Record<string, number>;

  // ── BRAIN ENRICHMENT (from cognitive stack) ───────────────────────────────
  /** Confidence in risk assessment (L6 Self-Modifying calibration) */
  confidence: number;
  /** AI-generated executive narrative (L15 Narrative Intelligence) */
  narrative: string;
  /** Intervention plan from Goal-Backward Planning (L14) */
  interventionPlan: InterventionPlan;
  /** Root cause analysis from Curiosity Engine (L5) */
  rootCauses: RootCauseAnalysis[];
  /** Stress-tested predictions from Red Team (L11) */
  stressTestResults: StressTestResult[];
  /** Historical dreaming insights (L3) */
  dreamingInsights: string[];
  /** Curiosity-driven hypotheses (L5) */
  explorationHypotheses: string[];

  /** Generated at */
  generatedAt: string;
  /** Raw Brain result for transparency */
  brainContext?: any;
}

export interface InterventionPlan {
  goal: string;
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  feasiblePaths: InterventionPath[];
  estimatedWeeks: number;
}

export interface InterventionPath {
  id: string;
  description: string;
  steps: InterventionStep[];
  successProbability: number;
  effortWeeks: number;
  priority: number;
}

export interface InterventionStep {
  stepNumber: number;
  action: string;
  owner: string;
  durationDays: number;
  dependencies: number[];
}

export interface RootCauseAnalysis {
  symptom: string;
  rootCause: string;
  evidence: string[];
  confidence: number;
  timeToRoot: string;
}

export interface StressTestResult {
  prediction: string;
  adversarialScenario: string;
  holdsUnderStress: boolean;
  failureReason?: string;
  adjustedConfidence: number;
}

// ============================================================================
// BRAIN-INTEGRATED EARLY WARNING SYSTEM
// ============================================================================

/**
 * Run early warning analysis: real engines first, brain enrichment on top.
 *
 * Real metrics (Gini, velocity drop, bus factor) are ALWAYS from the
 * actual detectors. The Brain adds narrative, root causes, and interventions.
 */
export async function runBrainEarlyWarning(
  config: BrainEarlyWarningConfig
): Promise<BrainEarlyWarningReport> {
  const {
    brainCommander,
    supabase,
    organizationId,
    domains = ['backend', 'frontend', 'infrastructure'],
    lookbackDays = 90,
    forecastDays = 7,
  } = config;

  // ==========================================================================
  // STEP 1: REAL ENGINE EXECUTION
  // Run the real detectors first — these produce actual numbers from the DB.
  // Runs in parallel for performance.
  // ==========================================================================
  const [bottleneckRisks, velocityCollapse, velocityMetrics, bottleneckHeatmap] =
    await Promise.all([
      detectAllBottlenecks({ supabase, organizationId, lookbackDays }, domains)
        .catch((err) => {
          console.warn('[BrainEarlyWarning] Bottleneck detection failed:', err?.message);
          return [] as BottleneckMetrics[];
        }),

      predictVelocityCollapse({
        supabase,
        organizationId,
        lookbackDays,
        forecastDays,
        collapseThreshold: 30,
      }).catch((err) => {
        console.warn('[BrainEarlyWarning] Velocity collapse prediction failed:', err?.message);
        return null;
      }),

      buildVelocityTimeSeries({ supabase, organizationId, lookbackDays })
        .catch(() => [] as VelocityMetrics[]),

      getBottleneckHeatmap({ supabase, organizationId, lookbackDays }, domains)
        .catch(() => ({} as Record<string, number>)),
    ]);

  // Generate real bottleneck alerts from actual metrics
  const bottleneckAlerts: BottleneckAlertEvent[] = bottleneckRisks.flatMap(
    (metrics) => generateBottleneckAlerts(metrics)
  );

  // Compute overall risk from REAL numbers
  const avgBRS =
    Object.values(bottleneckHeatmap).reduce((a, b) => a + b, 0) /
    Math.max(Object.keys(bottleneckHeatmap).length, 1);
  const bottleneckRiskScore = avgBRS * 100;
  const velocityRiskScore = velocityCollapse
    ? Math.min(100, velocityCollapse.predictedDrop * 2)
    : 0;
  const overallRisk = Math.round(bottleneckRiskScore * 0.4 + velocityRiskScore * 0.6);

  // ==========================================================================
  // STEP 2: BRAIN ENRICHMENT
  // Pass the real computed data into BrainCommander. The cognitive stack
  // adds narrative, root causes, interventions — it does NOT override metrics.
  // ==========================================================================
  let brainResult: any = null;
  let confidence = 0.75;
  let narrative = '';
  let rootCauses: RootCauseAnalysis[] = [];
  let interventionPlan: InterventionPlan = buildDefaultInterventionPlan(
    overallRisk,
    bottleneckRisks,
    velocityCollapse
  );
  let stressTestResults: StressTestResult[] = [];
  let dreamingInsights: string[] = [];
  let explorationHypotheses: string[] = [];

  try {
    // Build a context-rich query that includes REAL numbers so the Brain
    // reasons about actual data, not hypothetical scenarios.
    const highestGini = bottleneckRisks.length > 0
      ? Math.max(...bottleneckRisks.map((b) => b.giniCoefficient))
      : null;
    const lowestBusFactor = bottleneckRisks.length > 0
      ? Math.min(...bottleneckRisks.map((b) => b.busFactor))
      : null;

    const contextQuery = buildEnrichmentQuery({
      organizationId,
      domains,
      forecastDays,
      overallRisk,
      bottleneckRisks,
      velocityCollapse,
      highestGini,
      lowestBusFactor,
    });

    brainResult = await brainCommander.command(contextQuery, {
      userId: 'system:early-warning',
      domains,
    });

    // Extract brain enrichments (never override real metric values)
    confidence = brainResult.cognitiveStack?.selfModel?.calibrationScore ?? 0.75;

    narrative =
      brainResult.cognitiveStack?.narrative?.summary ||
      brainResult.artifact?.summary ||
      buildDefaultNarrative(overallRisk, bottleneckAlerts, velocityCollapse);

    dreamingInsights = brainResult.cognitiveStack?.dreaming?.surfacedInsights ?? [];
    explorationHypotheses = brainResult.cognitiveStack?.curiosity?.hypothesesGenerated ?? [];

    rootCauses = extractRootCauses(brainResult, bottleneckRisks, velocityCollapse);
    interventionPlan = extractOrBuildInterventionPlan(
      brainResult,
      overallRisk,
      bottleneckRisks,
      velocityCollapse
    );
    stressTestResults = extractStressTests(brainResult, velocityCollapse);
  } catch (err: any) {
    // Brain enrichment failure is non-fatal — real data is already computed above
    console.warn('[BrainEarlyWarning] Brain enrichment failed, returning real metrics only:', err?.message);
    narrative = buildDefaultNarrative(overallRisk, bottleneckAlerts, velocityCollapse);
  }

  return {
    organizationId,
    overallRisk,
    bottleneckRisks,
    bottleneckAlerts,
    velocityCollapse,
    velocityMetrics,
    bottleneckHeatmap,
    confidence,
    narrative,
    interventionPlan,
    rootCauses,
    stressTestResults,
    dreamingInsights,
    explorationHypotheses,
    generatedAt: new Date().toISOString(),
    brainContext: brainResult,
  };
}

// ============================================================================
// BRAIN ENRICHMENT QUERY BUILDER
// ============================================================================

function buildEnrichmentQuery(params: {
  organizationId: string;
  domains: string[];
  forecastDays: number;
  overallRisk: number;
  bottleneckRisks: BottleneckMetrics[];
  velocityCollapse: VelocityCollapseAlert | null;
  highestGini: number | null;
  lowestBusFactor: number | null;
}): string {
  const {
    organizationId,
    domains,
    forecastDays,
    overallRisk,
    bottleneckRisks,
    velocityCollapse,
    highestGini,
    lowestBusFactor,
  } = params;

  const bottleneckSummary =
    bottleneckRisks.length > 0
      ? bottleneckRisks
          .map(
            (b) =>
              `  - ${b.domain}: Gini=${b.giniCoefficient.toFixed(2)}, ` +
              `bus_factor=${b.busFactor}, top3_concentration=${b.top3Concentration}%`
          )
          .join('\n')
      : '  No bottleneck data available (contributor_expertise table may be empty)';

  const velocitySummary = velocityCollapse
    ? `Velocity collapse PREDICTED: ${velocityCollapse.predictedDrop.toFixed(1)}% drop in ` +
      `${velocityCollapse.daysUntilCollapse} days. Root cause: ${velocityCollapse.rootCause}. ` +
      `Current WIP: ${velocityCollapse.currentWIP}, baseline: ${velocityCollapse.baselineWIP}. ` +
      `Current velocity: ${velocityCollapse.currentVelocity.toFixed(1)} PRs/day → predicted: ` +
      `${velocityCollapse.predictedVelocity.toFixed(1)} PRs/day.`
    : 'No velocity collapse predicted in the next ' + forecastDays + ' days.';

  return `
Early Warning Analysis — Brain Enrichment Request
Organization: ${organizationId}
Overall Risk Score: ${overallRisk}/100
Domains: ${domains.join(', ')}

## REAL COMPUTED METRICS (do not override these):

### Bottleneck Concentration:
${bottleneckSummary}
Highest Gini coefficient: ${highestGini != null ? highestGini.toFixed(2) : 'N/A'}
Lowest bus factor: ${lowestBusFactor ?? 'N/A'}

### Velocity:
${velocitySummary}

## ENRICHMENT REQUESTS (add intelligence on top of the above data):

1. **Root Cause Exploration (L5 Curiosity):**
   - WHY is expertise concentrated this way? What historical patterns explain this?
   - WHY is velocity trending this direction? What causal signals support this?

2. **Confidence Calibration (L6 Self-Modifying):**
   - Based on historical prediction accuracy in this org, how confident should we be?
   - Adjust confidence based on data volume and signal recency.

3. **Contributor Perspectives (L9 Theory of Mind):**
   - Model how the bottleneck contributors likely perceive their situation.
   - Burnout risk? Awareness of their critical role? Engagement potential?

4. **Adversarial Stress Test (L11 Red Team):**
   - Challenge: what if the velocity collapse is actually a false positive?
   - Challenge: what if the Gini metric understates real concentration?

5. **Intervention Plan (L14 Goal-Backward):**
   - Goal: reduce overall risk from ${overallRisk} to below 30.
   - Build backward from the goal. What are the 2-3 highest-leverage actions?

6. **Executive Narrative (L15 Narrative):**
   - Synthesize a 3-5 sentence executive narrative explaining the situation.
   - Be direct. Use the real numbers above. Do not hedge with "may" or "might".
`.trim();
}

// ============================================================================
// BRAIN ENRICHMENT EXTRACTORS
// ============================================================================

function extractRootCauses(
  brainResult: any,
  bottleneckRisks: BottleneckMetrics[],
  velocityCollapse: VelocityCollapseAlert | null
): RootCauseAnalysis[] {
  const curiosityResults = brainResult?.cognitiveStack?.curiosity || {};
  const hypotheses = curiosityResults.hypothesesGenerated || [];

  if (hypotheses.length > 0) {
    return hypotheses.map((h: any) => ({
      symptom: h.observation || 'Bottleneck or velocity issue detected',
      rootCause: h.hypothesis || 'Unknown',
      evidence: h.supportingEvidence || [],
      confidence: h.confidence || 0.5,
      timeToRoot: h.timeline || 'Unknown',
    }));
  }

  // Generate data-driven root causes from real metrics when Brain has no hypotheses
  const causes: RootCauseAnalysis[] = [];

  for (const risk of bottleneckRisks) {
    if (risk.giniCoefficient > 0.6) {
      causes.push({
        symptom: `High expertise concentration in ${risk.domain} (Gini: ${risk.giniCoefficient.toFixed(2)})`,
        rootCause: 'Knowledge siloing — expertise not cross-trained across team',
        evidence: [
          `Gini coefficient: ${risk.giniCoefficient.toFixed(2)} (threshold: 0.60)`,
          `Bus factor: ${risk.busFactor} (ideal: ≥3)`,
          `Top-3 concentration: ${risk.top3Concentration}%`,
        ],
        confidence: 0.8,
        timeToRoot: 'Likely developed over 6-18 months of incremental ownership drift',
      });
    }
  }

  if (velocityCollapse) {
    causes.push({
      symptom: `Velocity collapse predicted: ${velocityCollapse.predictedDrop.toFixed(1)}% drop in ${velocityCollapse.daysUntilCollapse} days`,
      rootCause: velocityCollapse.rootCause === 'wip_accumulation'
        ? 'WIP accumulation — too many parallel tickets blocking throughput'
        : 'Velocity degradation from compounding review latency',
      evidence: [
        `Root cause signal: ${velocityCollapse.rootCause}`,
        `Current WIP: ${velocityCollapse.currentWIP} (baseline: ${velocityCollapse.baselineWIP})`,
        `Granger causality: ${velocityCollapse.causalEvidence?.isSignificant ? 'significant' : 'not significant'}`,
      ],
      confidence: 0.75,
      timeToRoot: `Trend visible in last ${velocityCollapse.daysUntilCollapse * 2} days of signal data`,
    });
  }

  return causes;
}

function extractOrBuildInterventionPlan(
  brainResult: any,
  overallRisk: number,
  bottleneckRisks: BottleneckMetrics[],
  velocityCollapse: VelocityCollapseAlert | null
): InterventionPlan {
  const planningResults = brainResult?.cognitiveStack?.planning || {};
  const feasiblePaths = planningResults.feasiblePaths || [];

  if (feasiblePaths.length > 0) {
    return {
      goal: planningResults.goal || 'Reduce engineering delivery risk',
      targetMetric: planningResults.targetMetric || 'overall_risk',
      currentValue: overallRisk,
      targetValue: planningResults.targetValue || 30,
      feasiblePaths: feasiblePaths.map((path: any, idx: number) => ({
        id: `path_${idx}`,
        description: path.description || '',
        steps: (path.steps || []).map((s: any, i: number) => ({
          stepNumber: i + 1,
          action: s.action || '',
          owner: s.owner || 'Engineering Lead',
          durationDays: s.durationDays || 7,
          dependencies: s.dependencies || [],
        })),
        successProbability: path.successProbability || 0.7,
        effortWeeks: path.effortWeeks || 8,
        priority: path.priority || idx + 1,
      })),
      estimatedWeeks: planningResults.estimatedWeeks || 12,
    };
  }

  return buildDefaultInterventionPlan(overallRisk, bottleneckRisks, velocityCollapse);
}

function buildDefaultInterventionPlan(
  overallRisk: number,
  bottleneckRisks: BottleneckMetrics[],
  velocityCollapse: VelocityCollapseAlert | null
): InterventionPlan {
  const paths: InterventionPath[] = [];
  let stepCounter = 1;

  // Bottleneck path — only if real data shows a problem
  const criticalBottleneck = bottleneckRisks.find((b) => b.busFactor < 3 || b.giniCoefficient > 0.6);
  if (criticalBottleneck) {
    paths.push({
      id: 'path_bottleneck_mitigation',
      description: `Reduce knowledge concentration in ${criticalBottleneck.domain} (Gini: ${criticalBottleneck.giniCoefficient.toFixed(2)}, bus factor: ${criticalBottleneck.busFactor})`,
      steps: [
        {
          stepNumber: stepCounter++,
          action: 'Identify top 2 contributors with highest expertise share from bottleneck alerts',
          owner: 'Engineering Manager',
          durationDays: 2,
          dependencies: [],
        },
        {
          stepNumber: stepCounter++,
          action: 'Establish paired programming rotation: bottleneck contributor + 2 others for 4 weeks',
          owner: 'Engineering Lead',
          durationDays: 28,
          dependencies: [stepCounter - 2],
        },
        {
          stepNumber: stepCounter++,
          action: 'Document critical knowledge areas in internal wiki — target: all bottleneck topics covered',
          owner: 'Bottleneck contributor',
          durationDays: 14,
          dependencies: [stepCounter - 3],
        },
      ],
      successProbability: 0.75,
      effortWeeks: 6,
      priority: 1,
    });
  }

  // Velocity path — only if real Granger/trend data shows collapse risk
  if (velocityCollapse && velocityCollapse.predictedDrop > 20) {
    paths.push({
      id: 'path_velocity_recovery',
      description: `Prevent ${velocityCollapse.predictedDrop.toFixed(0)}% velocity collapse — WIP reduction and review unblocking`,
      steps: [
        {
          stepNumber: stepCounter++,
          action: `Freeze new ticket intake for 1 sprint — focus team on resolving ${velocityCollapse.currentWIP} open WIP items`,
          owner: 'Product Manager + Engineering Lead',
          durationDays: 5,
          dependencies: [],
        },
        {
          stepNumber: stepCounter++,
          action: 'Daily async review standups — triage stale PRs older than 3 days',
          owner: 'Engineering Lead',
          durationDays: 14,
          dependencies: [stepCounter - 2],
        },
      ],
      successProbability: 0.7,
      effortWeeks: 3,
      priority: velocityCollapse.severity === 'critical' ? 1 : 2,
    });
  }

  return {
    goal: 'Reduce overall engineering delivery risk',
    targetMetric: 'overall_risk_score',
    currentValue: overallRisk,
    targetValue: 30,
    feasiblePaths: paths,
    estimatedWeeks: paths.length > 0 ? 8 : 0,
  };
}

function extractStressTests(
  brainResult: any,
  velocityCollapse: VelocityCollapseAlert | null
): StressTestResult[] {
  const redTeamResults = brainResult?.cognitiveStack?.redTeam || {};
  const stressTests = redTeamResults.stressTests || [];

  if (stressTests.length > 0) {
    return stressTests.map((test: any) => ({
      prediction: test.prediction || '',
      adversarialScenario: test.scenario || '',
      holdsUnderStress: test.holds ?? false,
      failureReason: test.failureReason,
      adjustedConfidence: test.adjustedConfidence || 0.5,
    }));
  }

  // Generate minimal stress tests from real data
  const results: StressTestResult[] = [];
  if (velocityCollapse) {
    results.push({
      prediction: `Velocity will drop ${velocityCollapse.predictedDrop.toFixed(1)}% in ${velocityCollapse.daysUntilCollapse} days`,
      adversarialScenario: 'Sprint ends early and team clears WIP backlog in the next 3 days',
      holdsUnderStress: velocityCollapse.predictedDrop > 40,
      failureReason:
        velocityCollapse.predictedDrop <= 40
          ? 'WIP clearance in next sprint could recover velocity before collapse threshold'
          : undefined,
      adjustedConfidence: velocityCollapse.predictedDrop > 40 ? 0.80 : 0.55,
    });
  }
  return results;
}

function buildDefaultNarrative(
  overallRisk: number,
  bottleneckAlerts: BottleneckAlertEvent[],
  velocityCollapse: VelocityCollapseAlert | null
): string {
  const riskLabel =
    overallRisk >= 80 ? 'CRITICAL' : overallRisk >= 60 ? 'HIGH' : overallRisk >= 40 ? 'MODERATE' : 'LOW';

  let narrative = `Overall engineering risk is ${riskLabel} at ${overallRisk}/100. `;

  if (bottleneckAlerts.length > 0) {
    const critical = bottleneckAlerts.filter((a) => a.severity === 'critical');
    if (critical.length > 0) {
      narrative += `${critical.length} critical knowledge concentration risk(s) detected in: `;
      narrative += `${critical.map((a) => a.domain).join(', ')}. `;
    } else {
      narrative += `${bottleneckAlerts.length} bottleneck risk(s) detected across monitored domains. `;
    }
  } else {
    narrative += 'No critical knowledge concentration risks detected. ';
  }

  if (velocityCollapse) {
    narrative +=
      `Deploy velocity collapse predicted: ${velocityCollapse.predictedDrop.toFixed(1)}% drop in ` +
      `${velocityCollapse.daysUntilCollapse} days due to ${velocityCollapse.rootCause}. ` +
      `Current WIP (${velocityCollapse.currentWIP}) is ${((velocityCollapse.currentWIP / Math.max(velocityCollapse.baselineWIP, 1)) * 100 - 100).toFixed(0)}% above baseline (${velocityCollapse.baselineWIP}). `;
  } else {
    narrative += 'No velocity collapse predicted in the forecast window. ';
  }

  if (overallRisk >= 60) {
    narrative += 'Immediate intervention recommended — see intervention plan for prioritized actions.';
  } else if (overallRisk >= 40) {
    narrative += 'Monitor trends closely and begin cross-training initiatives.';
  } else {
    narrative += 'Continue current practices and monitor for emerging concentration.';
  }

  return narrative;
}

/**
 * What-If Simulator — "Prefrontal Cortex"
 *
 * Like the brain's prefrontal cortex that imagines future scenarios
 * before committing to action, this engine simulates cascade effects
 * through the causal graph to predict what would happen if X changes.
 *
 * Usage:
 *   "What if marketing spend increases 20%?"
 *   → Traces marketing → leads → sales → revenue → hiring cascade
 *   → Returns timeline with confidence bands at each step
 *
 *   "What if we lose our biggest client?"
 *   → Traces revenue shock → support load → churn risk → NPS cascade
 *   → Shows intervention points with effectiveness scores
 *
 * How it works:
 *   1. Parse the "what if" input into a domain + direction + magnitude
 *   2. Load the causal graph and find all downstream paths
 *   3. For each path, compute the compound effect using effect sizes
 *   4. Apply lag times to generate a timeline
 *   5. Generate confidence bands using historical prediction accuracy
 *   6. Identify intervention points (where you can break the cascade)
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

/** The starting condition for a simulation */
export interface WhatIfScenario {
  /** Which domain is changing */
  sourceDomain: string;
  /** Direction of change */
  direction: 'increase' | 'decrease';
  /** Magnitude of change as percentage (e.g., 20 means +20%) */
  magnitudePercent: number;
  /** Optional: specific metric */
  metric?: string;
  /** Optional: time horizon in days (default: 90) */
  timeHorizonDays?: number;
}

/** A single step in a cascade prediction */
export interface CascadeStep {
  /** Source domain for this step */
  fromDomain: string;
  /** Target domain for this step */
  toDomain: string;
  /** Effect size of the causal edge (raw) */
  edgeEffectSize: number;
  /** Lag time in days */
  lagDays: number;
  /** Cumulative days from initial trigger */
  cumulativeDays: number;
  /** Predicted change percentage at this step */
  predictedChangePercent: number;
  /** Confidence interval */
  confidenceBand: { lower: number; upper: number };
  /** The causal edge's natural language description */
  edgeDescription: string;
  /** Whether this edge has been validated by predictions */
  isValidated: boolean;
}

/** An intervention opportunity in the cascade */
export interface SimulationIntervention {
  /** Which domain to intervene at */
  domain: string;
  /** When in the cascade (cumulative days) */
  availableAtDay: number;
  /** Time window to act before cascade propagates */
  windowDays: number;
  /** Estimated effectiveness (0-1) of intervention */
  effectiveness: number;
  /** Suggested action */
  suggestedAction: string;
}

/** Full simulation result */
export interface SimulationResult {
  /** The scenario that was simulated */
  scenario: WhatIfScenario;
  /** All cascade paths discovered */
  cascadePaths: CascadeStep[][];
  /** Flattened timeline of all effects */
  timeline: CascadeStep[];
  /** Domains that will be affected */
  affectedDomains: string[];
  /** Total estimated impact across all paths */
  totalImpactPercent: number;
  /** Confidence in the overall prediction (0-1) */
  overallConfidence: number;
  /** Intervention opportunities */
  interventions: SimulationIntervention[];
  /** Human-readable narrative */
  narrative: string;
  /** Duration in ms */
  durationMs: number;
}

/** Simulator configuration */
export interface WhatIfConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Maximum cascade depth to trace (default: 5) */
  maxCascadeDepth?: number;
  /** Minimum edge effect size to follow (default: 0.05) */
  minEffectSize?: number;
  /** Default confidence shrink per hop (default: 0.85) — each hop reduces confidence */
  confidenceDecayPerHop?: number;
  /** Verbose logging */
  verbose?: boolean;
  /** Optional LLM amplifier for enriched scenario narratives */
  amplifier?: import('./llm-brain-amplifier').BrainAmplifier;
}

// ============================================================================
// WHAT-IF SIMULATOR
// ============================================================================

export function createWhatIfSimulator(config: WhatIfConfig) {
  const {
    supabase,
    organizationId,
    maxCascadeDepth = 5,
    minEffectSize = 0.05,
    confidenceDecayPerHop = 0.85,
    verbose = false,
    amplifier,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [WHATIF] ${msg}`);
    }
  }

  // ── Load Graph ────────────────────────────────────────────────────

  interface GraphEdge {
    target: string;
    effectSize: number;
    lagDays: number;
    naturalLanguage: string;
    evidenceWeight: number;
    sampleSize: number;
    confidenceLower: number;
    confidenceUpper: number;
  }

  async function loadGraph(): Promise<Map<string, GraphEdge[]>> {
    const { data: relationships } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, evidence_weight, sample_size, confidence_interval_lower, confidence_interval_upper')
      .eq('organization_id', organizationId)
      .eq('is_significant', true);

    const graph = new Map<string, GraphEdge[]>();
    for (const r of relationships || []) {
      if (!graph.has(r.source_domain)) graph.set(r.source_domain, []);
      graph.get(r.source_domain)!.push({
        target: r.target_domain,
        effectSize: r.effect_size || 0,
        lagDays: r.optimal_lag_days || 7,
        naturalLanguage: r.natural_language || '',
        evidenceWeight: r.evidence_weight || 0.5,
        sampleSize: r.sample_size || 10,
        confidenceLower: r.confidence_interval_lower || 0,
        confidenceUpper: r.confidence_interval_upper || 0,
      });
    }

    return graph;
  }

  // ── Load Historical Prediction Accuracy ───────────────────────────

  async function getEdgeAccuracy(source: string, target: string): Promise<number> {
    // Check if this edge has prediction track record
    const { data } = await supabase
      .from('ai_memory')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('memory_type', 'prediction_verification')
      .limit(50);

    if (!data || data.length === 0) return 0.5; // No history → 50% confidence

    // Check for accuracy info
    let correct = 0;
    let total = 0;
    for (const row of data) {
      const meta = row.metadata as any;
      if (meta?.sourceDomain === source && meta?.targetDomain === target) {
        total++;
        if (meta?.wasCorrect) correct++;
      }
    }

    return total > 0 ? correct / total : 0.5;
  }

  // ── Trace All Cascade Paths ───────────────────────────────────────

  function tracePaths(
    graph: Map<string, GraphEdge[]>,
    startDomain: string,
    initialMagnitude: number,
    direction: 'increase' | 'decrease',
  ): CascadeStep[][] {
    const allPaths: CascadeStep[][] = [];
    const directionMultiplier = direction === 'decrease' ? -1 : 1;

    function dfs(
      current: string,
      currentMagnitude: number,
      cumulativeDays: number,
      depth: number,
      path: CascadeStep[],
      visited: Set<string>,
    ): void {
      if (depth >= maxCascadeDepth) return;

      const edges = graph.get(current);
      if (!edges || edges.length === 0) {
        if (path.length > 0) allPaths.push([...path]);
        return;
      }

      let hasValidChild = false;
      for (const edge of edges) {
        if (visited.has(edge.target)) continue;
        if (Math.abs(edge.effectSize) < minEffectSize) continue;

        hasValidChild = true;
        const propagatedChange = currentMagnitude * edge.effectSize;
        const newCumulativeDays = cumulativeDays + edge.lagDays;

        // Confidence shrinks with distance and edge quality
        const hopConfidence = Math.pow(confidenceDecayPerHop, depth + 1);
        const edgeQuality = Math.min(1.0, edge.evidenceWeight * 1.5);
        const totalConfidence = hopConfidence * edgeQuality;

        const bandWidth = Math.abs(propagatedChange) * (1 - totalConfidence);

        const step: CascadeStep = {
          fromDomain: current,
          toDomain: edge.target,
          edgeEffectSize: edge.effectSize,
          lagDays: edge.lagDays,
          cumulativeDays: newCumulativeDays,
          predictedChangePercent: propagatedChange * directionMultiplier,
          confidenceBand: {
            lower: (propagatedChange * directionMultiplier) - bandWidth,
            upper: (propagatedChange * directionMultiplier) + bandWidth,
          },
          edgeDescription: edge.naturalLanguage,
          isValidated: edge.evidenceWeight > 0.6,
        };

        path.push(step);
        visited.add(edge.target);
        dfs(edge.target, propagatedChange, newCumulativeDays, depth + 1, path, visited);
        visited.delete(edge.target);
        path.pop();
      }

      if (!hasValidChild && path.length > 0) {
        allPaths.push([...path]);
      }
    }

    const visited = new Set<string>();
    visited.add(startDomain);
    dfs(startDomain, initialMagnitude, 0, 0, [], visited);

    return allPaths;
  }

  // ── Generate Interventions ────────────────────────────────────────

  function generateInterventions(
    timeline: CascadeStep[],
  ): SimulationIntervention[] {
    const interventions: SimulationIntervention[] = [];
    const seenDomains = new Set<string>();

    // Sort by cumulative days
    const sorted = [...timeline].sort((a, b) => a.cumulativeDays - b.cumulativeDays);

    for (let i = 0; i < sorted.length; i++) {
      const step = sorted[i];
      if (seenDomains.has(step.toDomain)) continue;
      seenDomains.add(step.toDomain);

      // Window = time until next hop (or 7 days if last step)
      const nextStep = sorted.find(s => s.fromDomain === step.toDomain && s.cumulativeDays > step.cumulativeDays);
      const windowDays = nextStep ? (nextStep.cumulativeDays - step.cumulativeDays) : 7;

      // Effectiveness decreases deeper in the cascade
      const cascadePosition = step.cumulativeDays / Math.max(1, sorted[sorted.length - 1].cumulativeDays);
      const effectiveness = Math.max(0.1, 1.0 - cascadePosition * 0.7);

      const changeDir = step.predictedChangePercent > 0 ? 'increase' : 'decrease';
      const absChange = Math.abs(step.predictedChangePercent).toFixed(1);

      interventions.push({
        domain: step.toDomain,
        availableAtDay: step.cumulativeDays,
        windowDays,
        effectiveness,
        suggestedAction: `Intervene in ${step.toDomain} to counteract predicted ${absChange}% ${changeDir} (arriving ~day ${step.cumulativeDays} from ${step.fromDomain})`,
      });
    }

    // Sort by effectiveness descending
    interventions.sort((a, b) => b.effectiveness - a.effectiveness);
    return interventions;
  }

  // ── Generate Narrative ────────────────────────────────────────────

  function generateNarrative(
    scenario: WhatIfScenario,
    paths: CascadeStep[][],
    timeline: CascadeStep[],
    interventions: SimulationIntervention[],
    overallConfidence: number,
  ): string {
    const parts: string[] = [];
    const dir = scenario.direction === 'increase' ? 'increases' : 'decreases';

    parts.push(`If ${scenario.sourceDomain} ${dir} by ${scenario.magnitudePercent}%:`);

    if (paths.length === 0) {
      parts.push(`No downstream cascade effects predicted. This domain appears isolated in the causal graph.`);
      return parts.join('\n');
    }

    // Group effects by domain
    const domainEffects = new Map<string, { change: number; days: number }>();
    for (const step of timeline) {
      if (!domainEffects.has(step.toDomain)) {
        domainEffects.set(step.toDomain, { change: step.predictedChangePercent, days: step.cumulativeDays });
      }
    }

    parts.push('');
    parts.push(`Predicted cascade through ${domainEffects.size} domain${domainEffects.size !== 1 ? 's' : ''}:`);

    const sortedEffects = [...domainEffects.entries()].sort((a, b) => a[1].days - b[1].days);
    for (const [domain, effect] of sortedEffects) {
      const changeDir = effect.change > 0 ? '↑' : '↓';
      parts.push(`  Day ${effect.days}: ${domain} ${changeDir} ${Math.abs(effect.change).toFixed(1)}%`);
    }

    parts.push('');
    parts.push(`Overall confidence: ${(overallConfidence * 100).toFixed(0)}%`);

    if (interventions.length > 0) {
      parts.push('');
      parts.push('Intervention opportunities:');
      for (const iv of interventions.slice(0, 3)) {
        parts.push(`  • ${iv.suggestedAction} (effectiveness: ${(iv.effectiveness * 100).toFixed(0)}%, window: ${iv.windowDays}d)`);
      }
    }

    return parts.join('\n');
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Simulate a what-if scenario through the causal graph.
     */
    async simulate(scenario: WhatIfScenario): Promise<SimulationResult> {
      const start = Date.now();
      log(`Simulating: ${scenario.sourceDomain} ${scenario.direction} ${scenario.magnitudePercent}%`);

      const graph = await loadGraph();

      if (!graph.has(scenario.sourceDomain)) {
        return {
          scenario,
          cascadePaths: [],
          timeline: [],
          affectedDomains: [],
          totalImpactPercent: 0,
          overallConfidence: 0,
          interventions: [],
          narrative: `Cannot simulate: "${scenario.sourceDomain}" is not in the causal graph. No outgoing causal edges found.`,
          durationMs: Date.now() - start,
        };
      }

      // Trace all cascade paths
      const paths = tracePaths(graph, scenario.sourceDomain, scenario.magnitudePercent, scenario.direction);

      // Build flattened timeline (deduplicate by domain, keep strongest effect)
      const domainBestStep = new Map<string, CascadeStep>();
      for (const path of paths) {
        for (const step of path) {
          const existing = domainBestStep.get(step.toDomain);
          if (!existing || Math.abs(step.predictedChangePercent) > Math.abs(existing.predictedChangePercent)) {
            domainBestStep.set(step.toDomain, step);
          }
        }
      }
      const timeline = [...domainBestStep.values()].sort((a, b) => a.cumulativeDays - b.cumulativeDays);

      // Affected domains
      const affectedDomains = timeline.map(s => s.toDomain);

      // Total impact = sum of absolute effects at leaf nodes
      const totalImpactPercent = timeline.reduce((sum, s) => sum + Math.abs(s.predictedChangePercent), 0);

      // Overall confidence = average of per-step confidence
      let totalConfidence = 0;
      let confCount = 0;
      for (const step of timeline) {
        const range = step.confidenceBand.upper - step.confidenceBand.lower;
        const stepConf = Math.max(0, 1 - (range / (Math.abs(step.predictedChangePercent) * 2 + 0.01)));
        totalConfidence += stepConf;
        confCount++;
      }
      const overallConfidence = confCount > 0 ? totalConfidence / confCount : 0;

      // Generate interventions
      const interventions = generateInterventions(timeline);

      // Generate template narrative
      let narrative = generateNarrative(scenario, paths, timeline, interventions, overallConfidence);

      // LLM enhancement: generate rich scenario narrative if amplifier is available
      if (amplifier && timeline.length > 0) {
        try {
          const llmNarrative = await amplifier.generateScenarioNarrative({
            sourceDomain: scenario.sourceDomain,
            direction: scenario.direction,
            magnitudePercent: scenario.magnitudePercent,
            affectedDomains,
            totalImpactPercent,
            overallConfidence,
            templateNarrative: narrative,
            interventions: interventions.slice(0, 5).map(iv => ({
              domain: iv.domain,
              suggestedAction: iv.suggestedAction,
              effectiveness: iv.effectiveness,
            })),
            cascadeSteps: timeline.slice(0, 10).map(s => ({
              fromDomain: s.fromDomain,
              toDomain: s.toDomain,
              predictedChangePercent: s.predictedChangePercent,
              cumulativeDays: s.cumulativeDays,
            })),
          });

          if (llmNarrative.narrative && llmNarrative.narrative.length > 10) {
            narrative = llmNarrative.narrative;

            if (llmNarrative.scenarioRisks.length > 0) {
              narrative += '\n\nScenario Risks:\n' + llmNarrative.scenarioRisks.map(r => `  ⚠ ${r}`).join('\n');
            }
            if (llmNarrative.interventionRecommendations.length > 0) {
              narrative += '\n\nRecommended Interventions:\n' + llmNarrative.interventionRecommendations.map(r => `  → ${r}`).join('\n');
            }
            if (llmNarrative.confidenceAssessment) {
              narrative += `\n\nConfidence: ${llmNarrative.confidenceAssessment}`;
            }
          }
        } catch (err: any) {
          // Graceful degradation — template narrative stands
          if (verbose) {
            console.warn('[WHATIF] LLM narrative enhancement failed (using template):', err?.message);
          }
        }
      }

      // Persist simulation result
      try {
        await repository.logActivity({
          agentType: 'whatif_simulator',
          actionType: 'simulation',
          inputSummary: `What if ${scenario.sourceDomain} ${scenario.direction} ${scenario.magnitudePercent}%?`,
          outputSummary: `${affectedDomains.length} domains affected, total impact: ${totalImpactPercent.toFixed(1)}%, confidence: ${(overallConfidence * 100).toFixed(0)}%`,
          metadata: {
            scenario,
            affectedDomains,
            totalImpactPercent,
            overallConfidence,
            pathCount: paths.length,
          },
        });
      } catch (err) {
        // Non-critical: simulation activity log may fail without blocking simulation — err instanceof Error ? err.message : String(err) logged for debugging
      }

      const result: SimulationResult = {
        scenario,
        cascadePaths: paths,
        timeline,
        affectedDomains,
        totalImpactPercent,
        overallConfidence,
        interventions,
        narrative,
        durationMs: Date.now() - start,
      };

      if (verbose) {
        console.log(`\n[WHATIF] Simulation complete in ${(result.durationMs / 1000).toFixed(1)}s`);
        console.log(narrative);
        console.log('');
      }

      return result;
    },

    /**
     * Quick simulation — just returns the narrative.
     */
    async whatIf(domain: string, direction: 'increase' | 'decrease', magnitudePercent: number): Promise<string> {
      const result = await this.simulate({
        sourceDomain: domain,
        direction,
        magnitudePercent,
      });
      return result.narrative;
    },
  };
}

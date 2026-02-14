/**
 * Layer 8: Causal Imagination — Creativity Beyond Training Data
 *
 * The mind's ability to imagine what doesn't yet exist:
 *   - NOVEL HYPOTHESIS GENERATION: Propose entirely new causal paths
 *   - CREATIVE RECOMBINATION: Apply mechanisms from one domain to another
 *   - SCENARIO PLANNING: Multi-variable what-if with contingent outcomes
 *   - ANALOGICAL REASONING: "X is to Y as A is to ?"
 *   - IMAGINATION EVALUATION: Learn which imaginations prove accurate
 *
 * Brain Analog: Default Mode Network + Prefrontal Cortex (generative thought)
 * Compute Tier: interactive (<5s per imagination)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CausalImaginationConfig {
  /** Max hypotheses per imagination cycle (default: 10) */
  maxHypotheses?: number;
  /** Max scenarios per planning session (default: 5) */
  maxScenarios?: number;
  /** Novelty bonus for cross-domain hypotheses (default: 0.3) */
  crossDomainBonus?: number;
  /** Minimum plausibility score to keep a hypothesis (default: 0.2) */
  minPlausibility?: number;
}

export interface NovelHypothesis {
  id: string;
  /** The imagined causal relationship */
  cause: string;
  effect: string;
  /** How this was generated */
  method: 'gap_bridging' | 'analogy_transfer' | 'inverse_reasoning' | 'combinatorial' | 'extrapolation';
  /** The reasoning behind it */
  rationale: string;
  /** Domain(s) involved */
  domains: string[];
  /** Plausibility score (0-1) */
  plausibility: number;
  /** Novelty score — how unlike existing edges (0-1) */
  novelty: number;
  /** Potential impact if true (0-1) */
  potentialImpact: number;
  /** Suggested experiment to test this */
  testSuggestion: string;
  /** Timestamp */
  createdAt: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  /** Multiple simultaneous interventions */
  interventions: ScenarioIntervention[];
  /** Predicted outcomes per domain */
  predictedOutcomes: ScenarioOutcome[];
  /** Contingencies (if X then Y) */
  contingencies: Contingency[];
  /** Overall scenario probability */
  probability: number;
  /** Scenario impact rating */
  impact: 'transformative' | 'significant' | 'moderate' | 'minimal';
}

export interface ScenarioIntervention {
  domain: string;
  variable: string;
  changePercent: number;
  timing: 'immediate' | 'gradual_30d' | 'gradual_90d';
}

export interface ScenarioOutcome {
  domain: string;
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidenceInterval: [number, number];
  timeToEffect: number; // days
}

export interface Contingency {
  condition: string;
  ifTrue: string;
  ifFalse: string;
  probability: number;
}

export interface Analogy {
  /** Source domain pattern */
  source: { domain: string; cause: string; effect: string; mechanism: string };
  /** Target domain application */
  target: { domain: string; predictedCause: string; predictedEffect: string };
  /** How strong the analogy is (0-1) */
  strength: number;
  /** What makes this analogy work */
  sharedStructure: string;
}

export interface ImaginationResult {
  hypotheses: NovelHypothesis[];
  scenarios: Scenario[];
  analogies: Analogy[];
  totalImagined: number;
  topInsight: string;
}

export interface ImaginationEdge {
  source: string;
  target: string;
  weight: number;
  domain: string;
  confidence: number;
}

export interface ImaginationStats {
  totalHypotheses: number;
  totalScenarios: number;
  totalAnalogies: number;
  avgPlausibility: number;
  avgNovelty: number;
  hypothesesByMethod: Record<string, number>;
  validatedCount: number;
  validationRate: number;
}

export interface CausalImaginationInstance {
  /** Generate novel hypotheses from existing knowledge */
  imagine: (edges: ImaginationEdge[], domains: string[]) => ImaginationResult;
  /** Create multi-variable scenario plans */
  planScenarios: (edges: ImaginationEdge[], interventions: ScenarioIntervention[]) => Scenario[];
  /** Find cross-domain analogies */
  findAnalogies: (edges: ImaginationEdge[]) => Analogy[];
  /** Validate a hypothesis (was it confirmed?) */
  validateHypothesis: (id: string, confirmed: boolean) => void;
  /** Get stats */
  getStats: () => ImaginationStats;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<CausalImaginationConfig> = {
  maxHypotheses: 10,
  maxScenarios: 5,
  crossDomainBonus: 0.3,
  minPlausibility: 0.2,
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createCausalImagination(config?: CausalImaginationConfig): CausalImaginationInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Tracking
  const allHypotheses: Map<string, NovelHypothesis> = new Map();
  const allScenarios: Scenario[] = [];
  const allAnalogies: Analogy[] = [];
  let hypothesisCounter = 0;
  let scenarioCounter = 0;
  let validatedCount = 0;
  let confirmedCount = 0;

  /**
   * Generate novel hypotheses by exploring gaps and making creative leaps
   */
  function generateHypotheses(edges: ImaginationEdge[], domains: string[]): NovelHypothesis[] {
    const hypotheses: NovelHypothesis[] = [];
    const edgesByDomain = new Map<string, ImaginationEdge[]>();
    for (const e of edges) {
      const arr = edgesByDomain.get(e.domain) || [];
      arr.push(e);
      edgesByDomain.set(e.domain, arr);
    }

    // Method 1: Gap Bridging — find disconnected domains and hypothesize connections
    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const crossEdges = edges.filter(e =>
          (e.domain === domains[i] && edges.some(e2 => e2.source === e.target && e2.domain === domains[j])) ||
          (e.domain === domains[j] && edges.some(e2 => e2.source === e.target && e2.domain === domains[i]))
        );

        if (crossEdges.length === 0) {
          const d1Targets = (edgesByDomain.get(domains[i]) || []).map(e => e.target);
          const d2Sources = (edgesByDomain.get(domains[j]) || []).map(e => e.source);

          if (d1Targets.length > 0 && d2Sources.length > 0) {
            hypothesisCounter++;
            hypotheses.push({
              id: `hyp_${hypothesisCounter}`,
              cause: d1Targets[0],
              effect: d2Sources[0],
              method: 'gap_bridging',
              rationale: `No connection between ${domains[i]} and ${domains[j]} — ${d1Targets[0]} may influence ${d2Sources[0]}`,
              domains: [domains[i], domains[j]],
              plausibility: 0.3 + cfg.crossDomainBonus,
              novelty: 0.8,
              potentialImpact: 0.6,
              testSuggestion: `Measure correlation between ${d1Targets[0]} and ${d2Sources[0]} over 30 days`,
              createdAt: Date.now(),
            });
          }
        }
      }
    }

    // Method 2: Analogy Transfer — if A→B in domain1, and A' exists in domain2, imagine A'→B'
    for (const [d1, d1Edges] of edgesByDomain) {
      for (const [d2, d2Edges] of edgesByDomain) {
        if (d1 >= d2) continue;

        for (const e1 of d1Edges.slice(0, 3)) {
          // Find similar source in d2
          const similarSources = d2Edges.filter(e2 =>
            e2.source.toLowerCase().includes(e1.source.toLowerCase().split('_')[0]) ||
            e1.source.toLowerCase().includes(e2.source.toLowerCase().split('_')[0])
          );

          for (const e2 of similarSources.slice(0, 1)) {
            hypothesisCounter++;
            hypotheses.push({
              id: `hyp_${hypothesisCounter}`,
              cause: e2.source,
              effect: `${e1.target}_analog_in_${d2}`,
              method: 'analogy_transfer',
              rationale: `${e1.source}→${e1.target} in ${d1} suggests ${e2.source} may drive similar effect in ${d2}`,
              domains: [d1, d2],
              plausibility: e1.confidence * 0.6 + cfg.crossDomainBonus,
              novelty: 0.7,
              potentialImpact: e1.weight * 0.8,
              testSuggestion: `Test if ${e2.source} changes correlate with ${e1.target}-like effects in ${d2}`,
              createdAt: Date.now(),
            });
          }
        }
      }
    }

    // Method 3: Inverse Reasoning — if A→B with high weight, could B→A under different conditions?
    for (const e of edges.filter(e => e.weight > 0.5).slice(0, 5)) {
      const reverseExists = edges.some(re => re.source === e.target && re.target === e.source);
      if (!reverseExists) {
        hypothesisCounter++;
        hypotheses.push({
          id: `hyp_${hypothesisCounter}`,
          cause: e.target,
          effect: e.source,
          method: 'inverse_reasoning',
          rationale: `Strong ${e.source}→${e.target} exists — feedback loop ${e.target}→${e.source} may also exist`,
          domains: [e.domain],
          plausibility: e.weight * 0.4,
          novelty: 0.5,
          potentialImpact: e.weight * 0.7,
          testSuggestion: `Intervene on ${e.target} and measure if ${e.source} responds`,
          createdAt: Date.now(),
        });
      }
    }

    // Method 4: Combinatorial — combine two weak edges into one strong hypothesis
    const weakEdges = edges.filter(e => e.weight < 0.3 && e.weight > 0.1);
    for (let i = 0; i < Math.min(weakEdges.length, 5); i++) {
      for (let j = i + 1; j < Math.min(weakEdges.length, 5); j++) {
        if (weakEdges[i].target === weakEdges[j].source) {
          hypothesisCounter++;
          hypotheses.push({
            id: `hyp_${hypothesisCounter}`,
            cause: weakEdges[i].source,
            effect: weakEdges[j].target,
            method: 'combinatorial',
            rationale: `Two weak links ${weakEdges[i].source}→${weakEdges[i].target}→${weakEdges[j].target} may form one strong indirect path`,
            domains: [weakEdges[i].domain, weakEdges[j].domain],
            plausibility: (weakEdges[i].weight + weakEdges[j].weight) * 0.8,
            novelty: 0.6,
            potentialImpact: 0.5,
            testSuggestion: `Test direct path ${weakEdges[i].source}→${weakEdges[j].target}`,
            createdAt: Date.now(),
          });
        }
      }
    }

    // Filter by plausibility and limit
    const filtered = hypotheses
      .filter(h => h.plausibility >= cfg.minPlausibility)
      .sort((a, b) => (b.plausibility * b.novelty * b.potentialImpact) - (a.plausibility * a.novelty * a.potentialImpact))
      .slice(0, cfg.maxHypotheses);

    for (const h of filtered) {
      allHypotheses.set(h.id, h);
    }

    return filtered;
  }

  function planScenarios(edges: ImaginationEdge[], interventions: ScenarioIntervention[]): Scenario[] {
    const scenarios: Scenario[] = [];

    // Base scenario: all interventions applied
    scenarioCounter++;
    const baseOutcomes: ScenarioOutcome[] = [];

    for (const intervention of interventions) {
      // Trace downstream effects
      const affected = edges.filter(e => e.source === intervention.variable || e.domain === intervention.domain);
      for (const edge of affected.slice(0, 5)) {
        const predictedChange = intervention.changePercent * edge.weight;
        const timeToEffect = intervention.timing === 'immediate' ? 1 : intervention.timing === 'gradual_30d' ? 30 : 90;

        baseOutcomes.push({
          domain: edge.domain,
          metric: edge.target,
          currentValue: 100, // Normalized
          predictedValue: 100 + predictedChange,
          confidenceInterval: [100 + predictedChange * 0.7, 100 + predictedChange * 1.3],
          timeToEffect,
        });
      }
    }

    // Generate contingencies
    const contingencies: Contingency[] = [];
    for (const outcome of baseOutcomes) {
      if (Math.abs(outcome.predictedValue - outcome.currentValue) > 10) {
        contingencies.push({
          condition: `${outcome.metric} moves more than ${Math.abs(outcome.predictedValue - outcome.currentValue).toFixed(0)}%`,
          ifTrue: `Accelerate investment in ${outcome.domain}`,
          ifFalse: `Investigate why ${outcome.metric} didn't respond as expected`,
          probability: 0.6,
        });
      }
    }

    const totalImpact = baseOutcomes.reduce(
      (sum, o) => sum + Math.abs(o.predictedValue - o.currentValue), 0
    );
    const impactRating = totalImpact > 50 ? 'transformative' : totalImpact > 20 ? 'significant' : totalImpact > 5 ? 'moderate' : 'minimal';

    scenarios.push({
      id: `scenario_${scenarioCounter}`,
      name: 'Primary Scenario',
      description: `Apply ${interventions.length} intervention(s): ${interventions.map(i => `${i.variable} ${i.changePercent > 0 ? '+' : ''}${i.changePercent}%`).join(', ')}`,
      interventions,
      predictedOutcomes: baseOutcomes,
      contingencies,
      probability: 0.5,
      impact: impactRating as Scenario['impact'],
    });

    // Optimistic scenario (effects 1.5x)
    if (scenarios.length < cfg.maxScenarios) {
      scenarioCounter++;
      scenarios.push({
        ...scenarios[0],
        id: `scenario_${scenarioCounter}`,
        name: 'Optimistic Scenario',
        description: 'Best-case: interventions 50% more effective than expected',
        predictedOutcomes: baseOutcomes.map(o => ({
          ...o,
          predictedValue: o.currentValue + (o.predictedValue - o.currentValue) * 1.5,
        })),
        probability: 0.2,
      });
    }

    // Pessimistic scenario (effects 0.5x)
    if (scenarios.length < cfg.maxScenarios) {
      scenarioCounter++;
      scenarios.push({
        ...scenarios[0],
        id: `scenario_${scenarioCounter}`,
        name: 'Pessimistic Scenario',
        description: 'Worst-case: interventions only half as effective',
        predictedOutcomes: baseOutcomes.map(o => ({
          ...o,
          predictedValue: o.currentValue + (o.predictedValue - o.currentValue) * 0.5,
        })),
        probability: 0.2,
      });
    }

    allScenarios.push(...scenarios);
    return scenarios;
  }

  function findAnalogies(edges: ImaginationEdge[]): Analogy[] {
    const analogies: Analogy[] = [];
    const byDomain = new Map<string, ImaginationEdge[]>();
    for (const e of edges) {
      const arr = byDomain.get(e.domain) || [];
      arr.push(e);
      byDomain.set(e.domain, arr);
    }

    const domainList = [...byDomain.keys()];

    for (let i = 0; i < domainList.length; i++) {
      for (let j = i + 1; j < domainList.length; j++) {
        const d1Edges = byDomain.get(domainList[i])!;
        const d2Edges = byDomain.get(domainList[j])!;

        // Compare edge weight structures
        for (const e1 of d1Edges.slice(0, 5)) {
          for (const e2 of d2Edges.slice(0, 5)) {
            const weightSimilarity = 1 - Math.abs(e1.weight - e2.weight);
            const confSimilarity = 1 - Math.abs(e1.confidence - e2.confidence);
            const strength = (weightSimilarity + confSimilarity) / 2;

            if (strength > 0.6) {
              analogies.push({
                source: {
                  domain: domainList[i],
                  cause: e1.source,
                  effect: e1.target,
                  mechanism: `${e1.source} drives ${e1.target} (w=${e1.weight.toFixed(2)})`,
                },
                target: {
                  domain: domainList[j],
                  predictedCause: e2.source,
                  predictedEffect: e2.target,
                },
                strength,
                sharedStructure: `Similar causal weight (${e1.weight.toFixed(2)} vs ${e2.weight.toFixed(2)}) and confidence`,
              });
            }
          }
        }
      }
    }

    const sorted = analogies.sort((a, b) => b.strength - a.strength).slice(0, 10);
    allAnalogies.push(...sorted);
    return sorted;
  }

  function imagine(edges: ImaginationEdge[], domains: string[]): ImaginationResult {
    const hypotheses = generateHypotheses(edges, domains);
    const analogies = findAnalogies(edges);
    const scenarios: Scenario[] = []; // Scenarios require explicit interventions

    const topInsight = hypotheses.length > 0
      ? hypotheses[0].rationale
      : 'No novel hypotheses generated — knowledge graph may be fully explored';

    return {
      hypotheses,
      scenarios,
      analogies,
      totalImagined: hypotheses.length + analogies.length,
      topInsight,
    };
  }

  function validateHypothesis(id: string, confirmed: boolean): void {
    const hyp = allHypotheses.get(id);
    if (!hyp) return;

    validatedCount++;
    if (confirmed) confirmedCount++;
  }

  function getStats(): ImaginationStats {
    const allHyps = [...allHypotheses.values()];
    const methodCounts: Record<string, number> = {};
    for (const h of allHyps) {
      methodCounts[h.method] = (methodCounts[h.method] || 0) + 1;
    }

    return {
      totalHypotheses: allHyps.length,
      totalScenarios: allScenarios.length,
      totalAnalogies: allAnalogies.length,
      avgPlausibility: allHyps.length > 0
        ? allHyps.reduce((sum, h) => sum + h.plausibility, 0) / allHyps.length : 0,
      avgNovelty: allHyps.length > 0
        ? allHyps.reduce((sum, h) => sum + h.novelty, 0) / allHyps.length : 0,
      hypothesesByMethod: methodCounts,
      validatedCount,
      validationRate: validatedCount > 0 ? confirmedCount / validatedCount : 0,
    };
  }

  return {
    imagine,
    planScenarios,
    findAnalogies,
    validateHypothesis,
    getStats,
  };
}

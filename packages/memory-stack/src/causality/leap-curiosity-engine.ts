/**
 * Layer 5: Curiosity Engine — Intrinsic Motivation & Active Learning
 *
 * Goes beyond gap detection to implement genuine curiosity:
 *   - INTRINSIC MOTIVATION: Learning rate tracking, boredom/novelty detection
 *   - QUESTION GENERATION: Formulates hypotheses, not just data requests
 *   - EXPLORATION BUDGET: Resource-aware prioritization of what to explore
 *   - META-LEARNING: Learns which exploration strategies yield highest returns
 *   - HYPOTHESIS TESTING: Connects to experimentation engine for validation
 *
 * Brain Analog: Anterior Cingulate Cortex + Dopaminergic System
 * Compute Tier: background (periodic scans, continuous curiosity)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CuriosityEngineConfig {
  /** Maximum active hypotheses at once (default: 20) */
  maxActiveHypotheses?: number;
  /** Exploration budget per cycle (abstract units, default: 100) */
  explorationBudget?: number;
  /** Novelty decay rate (how fast things become "boring", default: 0.1) */
  noveltyDecayRate?: number;
  /** Minimum information gain to pursue exploration (default: 0.05) */
  minInformationGain?: number;
  /** Learning rate window — how many cycles to measure learning speed (default: 10) */
  learningRateWindow?: number;
}

export interface Hypothesis {
  id: string;
  /** The question being asked */
  question: string;
  /** The predicted answer */
  prediction: string;
  /** Domain this relates to */
  domain: string;
  /** Expected information gain if answered (0-1) */
  expectedInfoGain: number;
  /** Cost to test (exploration budget units) */
  explorationCost: number;
  /** Priority score (gain/cost ratio adjusted by novelty) */
  priority: number;
  /** Status */
  status: 'proposed' | 'testing' | 'confirmed' | 'refuted' | 'abandoned';
  /** Novelty score when first proposed */
  noveltyScore: number;
  /** How this hypothesis was generated */
  generationMethod: 'gap_detection' | 'analogy' | 'contradiction' | 'extrapolation' | 'random_walk';
  /** Results of testing (if tested) */
  testResult?: HypothesisTestResult;
  /** Timestamp */
  createdAt: number;
}

export interface HypothesisTestResult {
  /** Was the hypothesis confirmed? */
  confirmed: boolean;
  /** Actual information gained (0-1) */
  actualInfoGain: number;
  /** Evidence supporting/refuting */
  evidence: string;
  /** Time taken to test (ms) */
  testDurationMs: number;
}

export interface CuriositySignal {
  domain: string;
  metric: string;
  value: number;
  timestamp: number;
}

export interface KnowledgeGap {
  /** What we don't know */
  description: string;
  /** Domain */
  domain: string;
  /** How much this gap matters (0-1) */
  importance: number;
  /** How uncertain we are (0-1, higher = more uncertain) */
  uncertainty: number;
  /** Novelty — how new/interesting this gap is (0-1) */
  novelty: number;
}

export interface ExplorationStrategy {
  name: string;
  /** Historical success rate (0-1) */
  successRate: number;
  /** Number of times used */
  usageCount: number;
  /** Average information gain when this strategy is used */
  avgInfoGain: number;
  /** Weight in strategy selection (softmax) */
  weight: number;
}

export interface CuriosityReport {
  /** Current learning rate (knowledge gained per cycle) */
  learningRate: number;
  /** Learning rate trend */
  learningTrend: 'accelerating' | 'stable' | 'decelerating' | 'stalled';
  /** Active hypotheses */
  activeHypotheses: Hypothesis[];
  /** Top knowledge gaps */
  topGaps: KnowledgeGap[];
  /** Best exploration strategies */
  strategies: ExplorationStrategy[];
  /** Boredom level (0-1, higher = less novel things happening) */
  boredomLevel: number;
  /** Budget remaining */
  budgetRemaining: number;
  /** Total hypotheses tested */
  totalTested: number;
  /** Confirmation rate */
  confirmationRate: number;
}

export interface CuriosityEngineInstance {
  /** Scan for knowledge gaps and generate hypotheses */
  explore: (signals: CuriositySignal[], edges: CuriosityEdge[]) => Hypothesis[];
  /** Record hypothesis test result */
  recordTestResult: (hypothesisId: string, result: HypothesisTestResult) => void;
  /** Get active hypotheses prioritized by expected value */
  getHypotheses: () => Hypothesis[];
  /** Get current knowledge gaps */
  getKnowledgeGaps: () => KnowledgeGap[];
  /** Get curiosity report */
  getReport: () => CuriosityReport;
  /** Reset budget for new cycle */
  resetBudget: () => void;
}

export interface CuriosityEdge {
  source: string;
  target: string;
  weight: number;
  confidence: number;
  domain?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<CuriosityEngineConfig> = {
  maxActiveHypotheses: 20,
  explorationBudget: 100,
  noveltyDecayRate: 0.1,
  minInformationGain: 0.05,
  learningRateWindow: 10,
};

const GENERATION_METHODS = [
  'gap_detection',
  'analogy',
  'contradiction',
  'extrapolation',
  'random_walk',
] as const;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createCuriosityEngine(config?: CuriosityEngineConfig): CuriosityEngineInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  const hypotheses: Map<string, Hypothesis> = new Map();
  const knowledgeGaps: KnowledgeGap[] = [];
  const strategies: Map<string, ExplorationStrategy> = new Map();
  const learningHistory: number[] = []; // info gained per cycle
  let budgetRemaining = cfg.explorationBudget;
  let hypothesisCounter = 0;
  let noveltyBaseline = 0; // tracks the "expected novelty"

  // Initialize strategies
  for (const method of GENERATION_METHODS) {
    strategies.set(method, {
      name: method,
      successRate: 0.5,
      usageCount: 0,
      avgInfoGain: 0.1,
      weight: 1 / GENERATION_METHODS.length,
    });
  }

  /**
   * Compute novelty of a signal relative to what we've seen
   */
  function computeNovelty(signal: CuriositySignal, allSignals: CuriositySignal[]): number {
    const domainSignals = allSignals.filter(s => s.domain === signal.domain && s.metric === signal.metric);
    if (domainSignals.length < 2) return 0.9; // Very novel if few observations

    const values = domainSignals.map(s => s.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

    if (stdDev === 0) return 0.1; // Not novel if no variance

    const zScore = Math.abs((signal.value - mean) / stdDev);
    return Math.min(1, zScore / 3); // Normalize z-score to 0-1
  }

  /**
   * Select exploration strategy using softmax over weights
   */
  function selectStrategy(): string {
    const strats = [...strategies.values()];
    const maxWeight = Math.max(...strats.map(s => s.weight));
    const expWeights = strats.map(s => Math.exp((s.weight - maxWeight) / 0.3));
    const sumExp = expWeights.reduce((a, b) => a + b, 0);
    const probs = expWeights.map(w => w / sumExp);

    const rand = Math.random();
    let cumProb = 0;
    for (let i = 0; i < strats.length; i++) {
      cumProb += probs[i];
      if (rand <= cumProb) return strats[i].name;
    }
    return strats[strats.length - 1].name;
  }

  /**
   * Generate hypotheses from knowledge gaps
   */
  function generateHypotheses(
    gaps: KnowledgeGap[],
    edges: CuriosityEdge[],
  ): Hypothesis[] {
    const newHypotheses: Hypothesis[] = [];
    const edgesByDomain = new Map<string, CuriosityEdge[]>();
    for (const e of edges) {
      const d = e.domain || 'unknown';
      const arr = edgesByDomain.get(d) || [];
      arr.push(e);
      edgesByDomain.set(d, arr);
    }

    for (const gap of gaps) {
      if (budgetRemaining <= 0) break;

      const method = selectStrategy() as Hypothesis['generationMethod'];
      let question = '';
      let prediction = '';
      let cost = 10;

      switch (method) {
        case 'gap_detection':
          question = `What drives ${gap.description}?`;
          prediction = `There exists an undiscovered causal path affecting ${gap.domain}`;
          cost = 8;
          break;

        case 'analogy': {
          const otherDomains = [...edgesByDomain.keys()].filter(d => d !== gap.domain);
          const analogDomain = otherDomains[Math.floor(Math.random() * otherDomains.length)] || gap.domain;
          question = `Does the mechanism in ${analogDomain} also apply to ${gap.domain}?`;
          prediction = `Pattern from ${analogDomain} transfers to ${gap.domain}`;
          cost = 15;
          break;
        }

        case 'contradiction': {
          const domainEdges = edgesByDomain.get(gap.domain) || [];
          const weakestEdge = domainEdges.sort((a, b) => a.confidence - b.confidence)[0];
          if (weakestEdge) {
            question = `Is the relationship ${weakestEdge.source}→${weakestEdge.target} genuine or spurious?`;
            prediction = `${weakestEdge.source}→${weakestEdge.target} is confounded`;
            cost = 12;
          } else {
            question = `Are our assumptions about ${gap.domain} correct?`;
            prediction = `At least one assumption in ${gap.domain} is wrong`;
            cost = 10;
          }
          break;
        }

        case 'extrapolation':
          question = `If current trends in ${gap.domain} continue, what happens in 30 days?`;
          prediction = `${gap.domain} will show significant change within 30 days`;
          cost = 5;
          break;

        case 'random_walk': {
          const allDomains = [...edgesByDomain.keys()];
          const d1 = allDomains[Math.floor(Math.random() * allDomains.length)] || gap.domain;
          const d2 = allDomains[Math.floor(Math.random() * allDomains.length)] || gap.domain;
          question = `Is there a hidden connection between ${d1} and ${d2}?`;
          prediction = `${d1} and ${d2} share an undiscovered mediator`;
          cost = 20;
          break;
        }
      }

      const expectedGain = gap.importance * gap.uncertainty * gap.novelty;
      if (expectedGain < cfg.minInformationGain) continue;

      hypothesisCounter++;
      const id = `hyp_${Date.now()}_${hypothesisCounter}`;
      const hypothesis: Hypothesis = {
        id,
        question,
        prediction,
        domain: gap.domain,
        expectedInfoGain: expectedGain,
        explorationCost: cost,
        priority: expectedGain / cost,
        status: 'proposed',
        noveltyScore: gap.novelty,
        generationMethod: method,
        createdAt: Date.now(),
      };

      newHypotheses.push(hypothesis);
      budgetRemaining -= cost;
    }

    return newHypotheses.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Main exploration cycle
   */
  function explore(signals: CuriositySignal[], edges: CuriosityEdge[]): Hypothesis[] {
    // Step 1: Detect knowledge gaps
    knowledgeGaps.length = 0;

    // Gap type 1: Domains with signals but weak/no edges
    const signalDomains = new Set(signals.map(s => s.domain));
    const edgeDomains = new Set(edges.flatMap(e => [e.source, e.target]));

    for (const domain of signalDomains) {
      const domainEdges = edges.filter(e => e.source === domain || e.target === domain);
      if (domainEdges.length === 0) {
        knowledgeGaps.push({
          description: `No causal edges for domain: ${domain}`,
          domain,
          importance: 0.8,
          uncertainty: 1.0,
          novelty: 0.9,
        });
      } else {
        const avgConfidence = domainEdges.reduce((sum, e) => sum + e.confidence, 0) / domainEdges.length;
        if (avgConfidence < 0.5) {
          knowledgeGaps.push({
            description: `Low-confidence edges in ${domain} (avg: ${avgConfidence.toFixed(2)})`,
            domain,
            importance: 0.6,
            uncertainty: 1 - avgConfidence,
            novelty: 0.5,
          });
        }
      }
    }

    // Gap type 2: High-variance signals (something interesting happening)
    const signalsByMetric = new Map<string, number[]>();
    for (const s of signals) {
      const key = `${s.domain}:${s.metric}`;
      const arr = signalsByMetric.get(key) || [];
      arr.push(s.value);
      signalsByMetric.set(key, arr);
    }

    for (const [key, values] of signalsByMetric) {
      if (values.length < 3) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

      if (cv > 0.5) {
        const [domain, metric] = key.split(':');
        knowledgeGaps.push({
          description: `High variance in ${metric} (${domain}, CV=${cv.toFixed(2)})`,
          domain,
          importance: Math.min(1, cv / 2),
          uncertainty: 0.8,
          novelty: Math.min(1, cv / 3),
        });
      }
    }

    // Gap type 3: Missing domains referenced in edges
    for (const domain of edgeDomains) {
      if (!signalDomains.has(domain)) {
        knowledgeGaps.push({
          description: `Domain ${domain} referenced in edges but has no signals`,
          domain,
          importance: 0.7,
          uncertainty: 0.9,
          novelty: 0.6,
        });
      }
    }

    // Apply novelty decay
    for (const gap of knowledgeGaps) {
      gap.novelty *= (1 - cfg.noveltyDecayRate * noveltyBaseline);
    }

    // Sort by expected value
    knowledgeGaps.sort((a, b) => (b.importance * b.uncertainty * b.novelty) - (a.importance * a.uncertainty * a.novelty));

    // Step 2: Generate hypotheses
    const newHypotheses = generateHypotheses(knowledgeGaps.slice(0, 10), edges);

    // Step 3: Add to active set (respecting capacity)
    for (const hyp of newHypotheses) {
      if (hypotheses.size >= cfg.maxActiveHypotheses) {
        // Evict lowest priority
        let lowestId = '';
        let lowestPriority = Infinity;
        for (const [id, h] of hypotheses) {
          if (h.status === 'proposed' && h.priority < lowestPriority) {
            lowestPriority = h.priority;
            lowestId = id;
          }
        }
        if (lowestId && lowestPriority < hyp.priority) {
          hypotheses.delete(lowestId);
        } else {
          break;
        }
      }
      hypotheses.set(hyp.id, hyp);
    }

    // Update novelty baseline
    noveltyBaseline = Math.min(1, noveltyBaseline + 0.05);

    // Compute boredom
    const avgNovelty = knowledgeGaps.length > 0
      ? knowledgeGaps.reduce((sum, g) => sum + g.novelty, 0) / knowledgeGaps.length
      : 0;
    // Boredom increases when novelty is low
    noveltyBaseline = 1 - avgNovelty;

    return newHypotheses;
  }

  function recordTestResult(hypothesisId: string, result: HypothesisTestResult): void {
    const hyp = hypotheses.get(hypothesisId);
    if (!hyp) return;

    hyp.testResult = result;
    hyp.status = result.confirmed ? 'confirmed' : 'refuted';

    // Update strategy performance
    const strategy = strategies.get(hyp.generationMethod);
    if (strategy) {
      strategy.usageCount++;
      strategy.avgInfoGain = (strategy.avgInfoGain * (strategy.usageCount - 1) + result.actualInfoGain) / strategy.usageCount;
      strategy.successRate = result.confirmed
        ? strategy.successRate * 0.9 + 0.1
        : strategy.successRate * 0.9;
      // Update weight based on info gain
      strategy.weight = strategy.avgInfoGain * strategy.successRate;
    }

    // Track learning rate
    learningHistory.push(result.actualInfoGain);
    if (learningHistory.length > cfg.learningRateWindow) {
      learningHistory.shift();
    }
  }

  function getHypotheses(): Hypothesis[] {
    return [...hypotheses.values()]
      .filter(h => h.status === 'proposed' || h.status === 'testing')
      .sort((a, b) => b.priority - a.priority);
  }

  function getKnowledgeGaps(): KnowledgeGap[] {
    return [...knowledgeGaps];
  }

  function getReport(): CuriosityReport {
    const tested = [...hypotheses.values()].filter(h => h.status === 'confirmed' || h.status === 'refuted');
    const confirmed = tested.filter(h => h.status === 'confirmed');

    // Compute learning rate
    const learningRate = learningHistory.length > 0
      ? learningHistory.reduce((a, b) => a + b, 0) / learningHistory.length
      : 0;

    // Detect trend
    let learningTrend: CuriosityReport['learningTrend'] = 'stable';
    if (learningHistory.length >= 3) {
      const firstHalf = learningHistory.slice(0, Math.floor(learningHistory.length / 2));
      const secondHalf = learningHistory.slice(Math.floor(learningHistory.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.2) learningTrend = 'accelerating';
      else if (secondAvg < firstAvg * 0.8) learningTrend = 'decelerating';
      else if (secondAvg < 0.01) learningTrend = 'stalled';
    }

    const boredomLevel = 1 - (knowledgeGaps.length > 0
      ? knowledgeGaps.reduce((sum, g) => sum + g.novelty, 0) / knowledgeGaps.length
      : 0.5);

    return {
      learningRate,
      learningTrend,
      activeHypotheses: getHypotheses(),
      topGaps: knowledgeGaps.slice(0, 10),
      strategies: [...strategies.values()].sort((a, b) => b.weight - a.weight),
      boredomLevel,
      budgetRemaining,
      totalTested: tested.length,
      confirmationRate: tested.length > 0 ? confirmed.length / tested.length : 0,
    };
  }

  function resetBudget(): void {
    budgetRemaining = cfg.explorationBudget;
  }

  return {
    explore,
    recordTestResult,
    getHypotheses,
    getKnowledgeGaps,
    getReport,
    resetBudget,
  };
}

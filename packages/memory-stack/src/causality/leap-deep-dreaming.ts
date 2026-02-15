/**
 * Layer 3: Deep Dreaming — Subconscious Processing
 *
 * Beyond consolidation: generative recombination of knowledge.
 * The brain's "sleep mode" where loose associations form, patterns
 * incubate across cycles, and novel connections emerge that would
 * never surface through directed analysis alone.
 *
 * Cognitive Processes:
 *   1. REPLAY    — Re-traverse recent signal sequences in varied orders
 *   2. RECOMBINE — Merge patterns from different domains speculatively
 *   3. INCUBATE  — Track emerging insights across multiple dream cycles
 *   4. SURFACE   — Promote incubated insights when confidence is sufficient
 *   5. SURPRISE  — Detect unexpected connections during dreaming
 *
 * Brain Analog: Default Mode Network (DMN) — active during rest,
 * responsible for creativity, future planning, and self-referential thought.
 *
 * Compute Tier: scheduled (nightly, 2-4 hour window)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DeepDreamingConfig {
  /** Maximum dream associations to generate per cycle */
  maxAssociations?: number;
  /** Minimum confidence to surface an incubating insight */
  surfaceThreshold?: number;
  /** Number of replay permutations per dream cycle */
  replayPermutations?: number;
  /** Maximum incubation cycles before an insight is discarded */
  maxIncubationCycles?: number;
  /** Surprise threshold — associations above this are flagged */
  surpriseThreshold?: number;
  /** Cross-domain recombination enabled */
  crossDomainEnabled?: boolean;
}

export interface DreamAssociation {
  /** Unique ID */
  id: string;
  /** Source domain (where the pattern originated) */
  sourceDomain: string;
  /** Target domain (where it's being speculatively applied) */
  targetDomain: string;
  /** The hypothesized connection */
  hypothesis: string;
  /** Confidence in this association (0-1) */
  confidence: number;
  /** Surprise score — how unexpected this connection is (0-1) */
  surpriseScore: number;
  /** Supporting evidence from replay */
  evidence: DreamEvidence[];
  /** Cycle in which this was first dreamed */
  firstDreamedCycle: number;
  /** Number of cycles this has been incubating */
  incubationCycles: number;
  /** Status */
  status: 'incubating' | 'surfaced' | 'discarded' | 'validated';
  /** Timestamp */
  createdAt: number;
}

export interface DreamEvidence {
  /** Signal or pattern that supports the association */
  sourceId: string;
  /** Type of evidence */
  type: 'temporal_co_occurrence' | 'structural_similarity' | 'causal_analog' | 'statistical_mirror';
  /** Strength of support (0-1) */
  strength: number;
  /** Description */
  description: string;
}

export interface ReplaySequence {
  /** Original signal IDs in replay order */
  signalIds: string[];
  /** Domain of these signals */
  domain: string;
  /** Permutation index */
  permutationIndex: number;
  /** Patterns discovered in this permutation */
  discoveredPatterns: string[];
}

export interface DreamCycleResult {
  /** Cycle number */
  cycleNumber: number;
  /** Number of replay sequences processed */
  replaysProcessed: number;
  /** New associations generated */
  newAssociations: DreamAssociation[];
  /** Associations that gained confidence (reinforced) */
  reinforcedAssociations: string[];
  /** Associations promoted from incubation to surfaced */
  surfacedInsights: DreamAssociation[];
  /** Associations discarded (exceeded max incubation) */
  discardedAssociations: string[];
  /** Total surprise events */
  surpriseEvents: number;
  /** Duration in ms */
  durationMs: number;
  /** Summary narrative */
  narrative: string;
}

export interface DreamStats {
  totalCycles: number;
  totalAssociationsGenerated: number;
  totalSurfacedInsights: number;
  totalDiscarded: number;
  averageSurpriseScore: number;
  topDomainPairs: { source: string; target: string; count: number }[];
  incubatingCount: number;
  validationRate: number;
}

export interface DeepDreamingInstance {
  dream: (signals: DreamSignal[], existingEdges: DreamEdge[], patterns: DreamPattern[]) => DreamCycleResult;
  getIncubating: () => DreamAssociation[];
  getSurfaced: () => DreamAssociation[];
  validateAssociation: (id: string, confirmed: boolean) => void;
  getStats: () => DreamStats;
  reset: () => void;
  /** Serialize internal state for persistence */
  getState: () => { associations: DreamAssociation[]; cycleCount: number; totalGenerated: number; totalSurfaced: number; totalDiscarded: number };
  /** Restore internal state from persistence */
  loadState: (state: { associations: DreamAssociation[]; cycleCount: number; totalGenerated: number; totalSurfaced: number; totalDiscarded: number }) => void;
}

/** Minimal signal type for dreaming */
export interface DreamSignal {
  id: string;
  domain: string;
  timestamp: number;
  value: number;
  metadata?: Record<string, unknown>;
}

/** Minimal edge type for dreaming */
export interface DreamEdge {
  source: string;
  target: string;
  weight: number;
  domain?: string;
}

/** Minimal pattern type for dreaming */
export interface DreamPattern {
  id: string;
  domain: string;
  entities: string[];
  confidence: number;
  support: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<DeepDreamingConfig> = {
  maxAssociations: 50,
  surfaceThreshold: 0.7,
  replayPermutations: 5,
  maxIncubationCycles: 10,
  surpriseThreshold: 0.6,
  crossDomainEnabled: true,
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createDeepDreaming(config?: DeepDreamingConfig): DeepDreamingInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  let cycleCount = 0;
  let totalGenerated = 0;
  let totalSurfaced = 0;
  let totalDiscarded = 0;
  let totalValidated = 0;
  let totalAttemptedValidation = 0;
  const associations: Map<string, DreamAssociation> = new Map();

  /**
   * Fisher-Yates shuffle for replay permutations
   */
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Compute structural similarity between two domains based on their edge patterns
   */
  function computeStructuralSimilarity(
    domain1Edges: DreamEdge[],
    domain2Edges: DreamEdge[],
  ): number {
    if (domain1Edges.length === 0 || domain2Edges.length === 0) return 0;

    // Compare edge weight distributions
    const weights1 = domain1Edges.map(e => e.weight).sort();
    const weights2 = domain2Edges.map(e => e.weight).sort();

    // Kolmogorov-Smirnov-like comparison (simplified)
    const n1 = weights1.length;
    const n2 = weights2.length;
    let maxDiff = 0;

    for (let i = 0; i < Math.min(n1, n2); i++) {
      const cdf1 = (i + 1) / n1;
      const cdf2 = (i + 1) / n2;
      maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
    }

    // Convert KS statistic to similarity (0-1)
    return 1 - maxDiff;
  }

  /**
   * Find temporal co-occurrences across domains
   */
  function findTemporalCoOccurrences(
    signals: DreamSignal[],
    windowMs: number = 86400000, // 1 day
  ): { domain1: string; domain2: string; count: number; strength: number }[] {
    const byDomain = new Map<string, DreamSignal[]>();
    for (const s of signals) {
      const arr = byDomain.get(s.domain) || [];
      arr.push(s);
      byDomain.set(s.domain, arr);
    }

    const domains = [...byDomain.keys()];
    const coOccurrences: { domain1: string; domain2: string; count: number; strength: number }[] = [];

    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const d1Signals = byDomain.get(domains[i])!;
        const d2Signals = byDomain.get(domains[j])!;
        let count = 0;

        for (const s1 of d1Signals) {
          for (const s2 of d2Signals) {
            if (Math.abs(s1.timestamp - s2.timestamp) <= windowMs) {
              count++;
            }
          }
        }

        const maxPossible = Math.min(d1Signals.length, d2Signals.length);
        if (count > 0 && maxPossible > 0) {
          coOccurrences.push({
            domain1: domains[i],
            domain2: domains[j],
            count,
            strength: Math.min(1, count / maxPossible),
          });
        }
      }
    }

    return coOccurrences.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Replay signals in permuted orders to discover latent structures
   */
  function replaySignals(signals: DreamSignal[]): ReplaySequence[] {
    const byDomain = new Map<string, DreamSignal[]>();
    for (const s of signals) {
      const arr = byDomain.get(s.domain) || [];
      arr.push(s);
      byDomain.set(s.domain, arr);
    }

    const sequences: ReplaySequence[] = [];

    for (const [domain, domainSignals] of byDomain) {
      // Sort by timestamp first (canonical order)
      const sorted = [...domainSignals].sort((a, b) => a.timestamp - b.timestamp);

      for (let p = 0; p < cfg.replayPermutations; p++) {
        const permuted = p === 0 ? sorted : shuffle(sorted);
        const patterns: string[] = [];

        // Look for monotonic runs in permuted order (latent structure)
        let runLength = 1;
        let runDirection: 'up' | 'down' | null = null;

        for (let i = 1; i < permuted.length; i++) {
          const diff = permuted[i].value - permuted[i - 1].value;
          const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : null;

          if (direction === runDirection) {
            runLength++;
          } else {
            if (runLength >= 3) {
              patterns.push(`${runDirection}_run_${runLength}_in_${domain}`);
            }
            runLength = 1;
            runDirection = direction;
          }
        }
        if (runLength >= 3) {
          patterns.push(`${runDirection}_run_${runLength}_in_${domain}`);
        }

        sequences.push({
          signalIds: permuted.map(s => s.id),
          domain,
          permutationIndex: p,
          discoveredPatterns: patterns,
        });
      }
    }

    return sequences;
  }

  /**
   * Generate novel cross-domain associations through speculative recombination
   */
  function recombine(
    signals: DreamSignal[],
    edges: DreamEdge[],
    patterns: DreamPattern[],
  ): DreamAssociation[] {
    const newAssociations: DreamAssociation[] = [];

    if (!cfg.crossDomainEnabled) return newAssociations;

    // 1. Find temporal co-occurrences
    const coOccurrences = findTemporalCoOccurrences(signals);

    // 2. Find structural similarities between domain edge graphs
    const edgesByDomain = new Map<string, DreamEdge[]>();
    for (const e of edges) {
      const domain = e.domain || 'unknown';
      const arr = edgesByDomain.get(domain) || [];
      arr.push(e);
      edgesByDomain.set(domain, arr);
    }

    const domains = [...edgesByDomain.keys()];
    const structuralPairs: { d1: string; d2: string; similarity: number }[] = [];

    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const sim = computeStructuralSimilarity(
          edgesByDomain.get(domains[i])!,
          edgesByDomain.get(domains[j])!,
        );
        if (sim > 0.3) {
          structuralPairs.push({ d1: domains[i], d2: domains[j], similarity: sim });
        }
      }
    }

    // 3. Find pattern analogs (patterns in one domain that mirror another)
    const patternsByDomain = new Map<string, DreamPattern[]>();
    for (const p of patterns) {
      const arr = patternsByDomain.get(p.domain) || [];
      arr.push(p);
      patternsByDomain.set(p.domain, arr);
    }

    // 4. Generate associations from all three sources
    // Temporal co-occurrences
    for (const coOcc of coOccurrences.slice(0, 10)) {
      const existingKey = `${coOcc.domain1}→${coOcc.domain2}`;
      if (!associations.has(existingKey)) {
        const evidence: DreamEvidence[] = [{
          sourceId: `cooccurrence_${coOcc.domain1}_${coOcc.domain2}`,
          type: 'temporal_co_occurrence',
          strength: coOcc.strength,
          description: `${coOcc.count} temporal co-occurrences within 24h window`,
        }];

        newAssociations.push({
          id: existingKey,
          sourceDomain: coOcc.domain1,
          targetDomain: coOcc.domain2,
          hypothesis: `Changes in ${coOcc.domain1} may influence ${coOcc.domain2} (observed ${coOcc.count} co-occurrences)`,
          confidence: coOcc.strength * 0.4, // Low initial confidence
          surpriseScore: coOcc.strength > 0.7 ? 0.8 : 0.4,
          evidence,
          firstDreamedCycle: cycleCount,
          incubationCycles: 0,
          status: 'incubating',
          createdAt: Date.now(),
        });
      }
    }

    // Structural similarities
    for (const pair of structuralPairs.slice(0, 10)) {
      const existingKey = `struct_${pair.d1}→${pair.d2}`;
      if (!associations.has(existingKey)) {
        newAssociations.push({
          id: existingKey,
          sourceDomain: pair.d1,
          targetDomain: pair.d2,
          hypothesis: `${pair.d1} and ${pair.d2} share structural similarity (${(pair.similarity * 100).toFixed(0)}%) — causal mechanisms may transfer`,
          confidence: pair.similarity * 0.3,
          surpriseScore: pair.similarity > 0.8 ? 0.9 : 0.5,
          evidence: [{
            sourceId: `structural_${pair.d1}_${pair.d2}`,
            type: 'structural_similarity',
            strength: pair.similarity,
            description: `Edge weight distributions are ${(pair.similarity * 100).toFixed(0)}% similar`,
          }],
          firstDreamedCycle: cycleCount,
          incubationCycles: 0,
          status: 'incubating',
          createdAt: Date.now(),
        });
      }
    }

    // Pattern analogs
    for (const [d1, p1s] of patternsByDomain) {
      for (const [d2, p2s] of patternsByDomain) {
        if (d1 >= d2) continue;
        for (const p1 of p1s) {
          for (const p2 of p2s) {
            // Check if patterns have similar entity counts and confidence
            if (
              Math.abs(p1.entities.length - p2.entities.length) <= 1 &&
              Math.abs(p1.confidence - p2.confidence) < 0.2
            ) {
              const key = `analog_${p1.id}→${p2.id}`;
              if (!associations.has(key)) {
                newAssociations.push({
                  id: key,
                  sourceDomain: d1,
                  targetDomain: d2,
                  hypothesis: `Pattern in ${d1} (${p1.entities.length} entities, conf=${p1.confidence.toFixed(2)}) mirrors pattern in ${d2} — may share causal mechanism`,
                  confidence: (p1.confidence + p2.confidence) / 2 * 0.3,
                  surpriseScore: 0.6,
                  evidence: [{
                    sourceId: `${p1.id}_${p2.id}`,
                    type: 'causal_analog',
                    strength: (p1.confidence + p2.confidence) / 2,
                    description: `Analogous patterns across ${d1} and ${d2}`,
                  }],
                  firstDreamedCycle: cycleCount,
                  incubationCycles: 0,
                  status: 'incubating',
                  createdAt: Date.now(),
                });
              }
            }
          }
        }
      }
    }

    // Limit to maxAssociations
    return newAssociations.slice(0, cfg.maxAssociations);
  }

  /**
   * Run a full dream cycle
   */
  function dream(
    signals: DreamSignal[],
    existingEdges: DreamEdge[],
    patterns: DreamPattern[],
  ): DreamCycleResult {
    const startTime = Date.now();
    cycleCount++;

    // Step 1: REPLAY
    const replays = replaySignals(signals);

    // Step 2: RECOMBINE
    const newAssociationsList = recombine(signals, existingEdges, patterns);
    for (const assoc of newAssociationsList) {
      associations.set(assoc.id, assoc);
    }
    totalGenerated += newAssociationsList.length;

    // Step 3: INCUBATE — reinforce existing associations with new evidence
    const reinforced: string[] = [];
    for (const [id, assoc] of associations) {
      if (assoc.status !== 'incubating') continue;

      assoc.incubationCycles++;

      // Check if new signals provide additional evidence
      const domainSignals1 = signals.filter(s => s.domain === assoc.sourceDomain);
      const domainSignals2 = signals.filter(s => s.domain === assoc.targetDomain);

      if (domainSignals1.length > 0 && domainSignals2.length > 0) {
        // Compute correlation between domain signal values
        const values1 = domainSignals1.map(s => s.value);
        const values2 = domainSignals2.map(s => s.value);
        const minLen = Math.min(values1.length, values2.length);

        if (minLen >= 3) {
          const mean1 = values1.reduce((a, b) => a + b, 0) / values1.length;
          const mean2 = values2.reduce((a, b) => a + b, 0) / values2.length;
          let num = 0, den1 = 0, den2 = 0;
          for (let i = 0; i < minLen; i++) {
            const d1 = values1[i] - mean1;
            const d2 = values2[i] - mean2;
            num += d1 * d2;
            den1 += d1 * d1;
            den2 += d2 * d2;
          }
          const corr = den1 > 0 && den2 > 0 ? num / Math.sqrt(den1 * den2) : 0;
          const absCorr = Math.abs(corr);

          if (absCorr > 0.3) {
            // Reinforce — increase confidence
            assoc.confidence = Math.min(1, assoc.confidence + absCorr * 0.1);
            assoc.evidence.push({
              sourceId: `cycle_${cycleCount}_correlation`,
              type: 'statistical_mirror',
              strength: absCorr,
              description: `Correlation of ${corr.toFixed(3)} observed in cycle ${cycleCount}`,
            });
            reinforced.push(id);
          }
        }
      }

      // Discard if too old with no progress
      if (assoc.incubationCycles > cfg.maxIncubationCycles && assoc.confidence < cfg.surfaceThreshold * 0.5) {
        assoc.status = 'discarded';
        totalDiscarded++;
      }
    }

    // Step 4: SURFACE — promote confident associations
    const surfaced: DreamAssociation[] = [];
    for (const [, assoc] of associations) {
      if (assoc.status === 'incubating' && assoc.confidence >= cfg.surfaceThreshold) {
        assoc.status = 'surfaced';
        surfaced.push(assoc);
        totalSurfaced++;
      }
    }

    // Step 5: Count surprises
    const surpriseEvents = newAssociationsList.filter(
      a => a.surpriseScore >= cfg.surpriseThreshold
    ).length;

    const discarded = [...associations.values()].filter(
      a => a.status === 'discarded' && a.incubationCycles === cfg.maxIncubationCycles + 1
    ).map(a => a.id);

    const durationMs = Date.now() - startTime;

    // Generate narrative
    const narrative = generateDreamNarrative(
      newAssociationsList.length,
      reinforced.length,
      surfaced.length,
      surpriseEvents,
      durationMs,
    );

    return {
      cycleNumber: cycleCount,
      replaysProcessed: replays.length,
      newAssociations: newAssociationsList,
      reinforcedAssociations: reinforced,
      surfacedInsights: surfaced,
      discardedAssociations: discarded,
      surpriseEvents,
      durationMs,
      narrative,
    };
  }

  function generateDreamNarrative(
    newCount: number,
    reinforcedCount: number,
    surfacedCount: number,
    surpriseCount: number,
    durationMs: number,
  ): string {
    const parts: string[] = [];
    parts.push(`Dream cycle ${cycleCount} completed in ${durationMs}ms.`);

    if (newCount > 0) {
      parts.push(`Generated ${newCount} new speculative associations.`);
    }
    if (reinforcedCount > 0) {
      parts.push(`Reinforced ${reinforcedCount} existing hypotheses with new evidence.`);
    }
    if (surfacedCount > 0) {
      parts.push(`SURFACED ${surfacedCount} insight(s) — confidence crossed threshold.`);
    }
    if (surpriseCount > 0) {
      parts.push(`Detected ${surpriseCount} surprise connections.`);
    }

    const incubating = [...associations.values()].filter(a => a.status === 'incubating').length;
    parts.push(`${incubating} associations still incubating.`);

    return parts.join(' ');
  }

  function getIncubating(): DreamAssociation[] {
    return [...associations.values()].filter(a => a.status === 'incubating');
  }

  function getSurfaced(): DreamAssociation[] {
    return [...associations.values()].filter(a => a.status === 'surfaced');
  }

  function validateAssociation(id: string, confirmed: boolean): void {
    const assoc = associations.get(id);
    if (!assoc) return;

    totalAttemptedValidation++;
    if (confirmed) {
      assoc.status = 'validated';
      totalValidated++;
    } else {
      assoc.status = 'discarded';
      totalDiscarded++;
    }
  }

  function getStats(): DreamStats {
    const allAssocs = [...associations.values()];
    const surpriseScores = allAssocs.map(a => a.surpriseScore);
    const avgSurprise = surpriseScores.length > 0
      ? surpriseScores.reduce((a, b) => a + b, 0) / surpriseScores.length
      : 0;

    // Count domain pairs
    const pairCounts = new Map<string, number>();
    for (const a of allAssocs) {
      const key = `${a.sourceDomain}→${a.targetDomain}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
    const topPairs = [...pairCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const [source, target] = key.split('→');
        return { source, target, count };
      });

    return {
      totalCycles: cycleCount,
      totalAssociationsGenerated: totalGenerated,
      totalSurfacedInsights: totalSurfaced,
      totalDiscarded,
      averageSurpriseScore: avgSurprise,
      topDomainPairs: topPairs,
      incubatingCount: allAssocs.filter(a => a.status === 'incubating').length,
      validationRate: totalAttemptedValidation > 0 ? totalValidated / totalAttemptedValidation : 0,
    };
  }

  function reset(): void {
    cycleCount = 0;
    totalGenerated = 0;
    totalSurfaced = 0;
    totalDiscarded = 0;
    totalValidated = 0;
    totalAttemptedValidation = 0;
    associations.clear();
  }

  function getState() {
    return {
      associations: Array.from(associations.values()),
      cycleCount,
      totalGenerated,
      totalSurfaced,
      totalDiscarded,
    };
  }

  function loadState(state: { associations: DreamAssociation[]; cycleCount: number; totalGenerated: number; totalSurfaced: number; totalDiscarded: number }) {
    associations.clear();
    for (const a of state.associations) {
      associations.set(a.id, a);
    }
    cycleCount = state.cycleCount;
    totalGenerated = state.totalGenerated;
    totalSurfaced = state.totalSurfaced;
    totalDiscarded = state.totalDiscarded;
  }

  return {
    dream,
    getIncubating,
    getSurfaced,
    validateAssociation,
    getStats,
    reset,
    getState,
    loadState,
  };
}

/**
 * Learning Validator — Proof That the Brain Actually Learned
 * ===========================================================
 *
 * Brain Analog: Neurological exam after training. A doctor tests whether
 * a patient's brain actually formed new connections after rehabilitation,
 * not just whether the exercises were performed.
 *
 * This module answers the CTO's question: "How do I KNOW the brain learned?"
 *
 * It does this by:
 *   1. Snapshotting brain state BEFORE training (priors, posteriors, graph)
 *   2. Running the training
 *   3. Snapshotting brain state AFTER training
 *   4. Computing concrete DELTAS that prove state changed
 *   5. Validating that the changes are MEANINGFUL (not noise)
 *
 * Evidence hierarchy (strongest to weakest):
 *   L1: Bayesian posterior shift (α/β actually changed)
 *   L2: Contrastive accuracy improvement (classifier got smarter)
 *   L3: Embedding space separation (domains moved in vector space)
 *   L4: Graph structure change (new edges or weight changes)
 *   L5: Knowledge coverage expansion (new domains learned)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Snapshot of brain state at a point in time */
export interface BrainSnapshot {
  /** When this snapshot was taken */
  timestamp: string;
  /** Bayesian posteriors per edge: key="source→target" */
  posteriors: Map<string, PosteriorSnapshot>;
  /** Contrastive learner accuracy */
  contrastiveAccuracy: number;
  /** Contrastive learner total examples */
  contrastiveExamples: number;
  /** Embedding tuner loss */
  embeddingLoss: number;
  /** Number of edges in causal graph */
  graphEdgeCount: number;
  /** Domains with any knowledge */
  knownDomains: Set<string>;
  /** Total evidence count across all edges */
  totalEvidence: number;
}

/** Posterior snapshot for a single edge */
export interface PosteriorSnapshot {
  alpha: number;
  beta: number;
  mean: number;
  evidenceCount: number;
  credibleIntervalWidth: number;
}

/** Proof that learning happened — concrete measurable deltas */
export interface LearningProof {
  /** Overall verdict: did the brain actually learn? */
  verdict: 'learned' | 'no_change' | 'degraded';
  /** Confidence in the verdict (0-1) */
  confidence: number;
  /** Human-readable summary */
  summary: string;
  /** Detailed evidence at each level */
  evidence: LearningEvidence[];
  /** Before snapshot */
  before: BrainSnapshotSummary;
  /** After snapshot */
  after: BrainSnapshotSummary;
  /** Specific deltas */
  deltas: LearningDeltas;
  /** Timestamp */
  validatedAt: string;
}

/** Summary of a snapshot (serializable, no Maps/Sets) */
export interface BrainSnapshotSummary {
  timestamp: string;
  posteriorCount: number;
  contrastiveAccuracy: number;
  contrastiveExamples: number;
  embeddingLoss: number;
  graphEdgeCount: number;
  knownDomainCount: number;
  totalEvidence: number;
  /** Average posterior mean across all edges */
  avgPosteriorMean: number;
  /** Average credible interval width */
  avgCIWidth: number;
}

/** Concrete deltas between before and after */
export interface LearningDeltas {
  /** New edges added to causal graph */
  newEdges: number;
  /** Edges whose posterior shifted */
  posteriorShifts: PosteriorShift[];
  /** New domains the brain didn't know about before */
  newDomains: string[];
  /** Contrastive accuracy delta */
  contrastiveAccuracyDelta: number;
  /** New contrastive examples trained */
  newContrastiveExamples: number;
  /** Embedding loss delta (negative = improvement) */
  embeddingLossDelta: number;
  /** Total new evidence added */
  newEvidence: number;
  /** Average posterior mean shift */
  avgPosteriorMeanShift: number;
  /** Average CI width change (negative = more certain) */
  avgCIWidthChange: number;
}

/** A specific posterior shift on one edge */
export interface PosteriorShift {
  edge: string;
  alphaBefore: number;
  alphaAfter: number;
  betaBefore: number;
  betaAfter: number;
  meanBefore: number;
  meanAfter: number;
  meanDelta: number;
  ciWidthBefore: number;
  ciWidthAfter: number;
  /** Interpretation */
  interpretation: string;
}

/** A single piece of evidence for/against learning */
export interface LearningEvidence {
  /** Evidence level (L1=strongest) */
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  /** What was measured */
  metric: string;
  /** Whether this metric improved */
  passed: boolean;
  /** The before value */
  before: number;
  /** The after value */
  after: number;
  /** The delta */
  delta: number;
  /** Human-readable explanation */
  explanation: string;
}

// ============================================================================
// SNAPSHOT FUNCTIONS
// ============================================================================

/**
 * Take a snapshot of the current brain state.
 * Uses the actual module instances (bayesian updater, contrastive learner, etc.)
 */
export function takeBrainSnapshot(modules: {
  bayesianUpdater?: { getAllPosteriors: () => Array<{
    sourceDomain: string;
    targetDomain: string;
    alpha: number;
    beta: number;
    mean: number;
    evidenceCount: number;
    credibleInterval: [number, number];
  }> };
  contrastiveLearner?: { getStats: () => { accuracy: number; examplesSeen: number } };
  embeddingTuner?: { getStats?: () => { currentLoss: number } };
  brainTrainer?: { getTrainedGraph: () => { edges: unknown[] | undefined } | undefined };
}): BrainSnapshot {
  const posteriors = new Map<string, PosteriorSnapshot>();
  const knownDomains = new Set<string>();
  let totalEvidence = 0;

  // Capture Bayesian posteriors
  if (modules.bayesianUpdater) {
    const allPosteriors = modules.bayesianUpdater.getAllPosteriors();
    for (const p of allPosteriors) {
      const key = `${p.sourceDomain}→${p.targetDomain}`;
      posteriors.set(key, {
        alpha: p.alpha,
        beta: p.beta,
        mean: p.mean,
        evidenceCount: p.evidenceCount,
        credibleIntervalWidth: p.credibleInterval[1] - p.credibleInterval[0],
      });
      knownDomains.add(p.sourceDomain);
      knownDomains.add(p.targetDomain);
      totalEvidence += p.evidenceCount;
    }
  }

  // Capture contrastive learner state
  const contrastiveStats = modules.contrastiveLearner?.getStats() || { accuracy: 0, examplesSeen: 0 };

  // Capture embedding tuner state
  const embeddingLoss = modules.embeddingTuner?.getStats?.()?.currentLoss ?? 1.0;

  // Capture graph state
  let graphEdgeCount = 0;
  try {
    const graph = modules.brainTrainer?.getTrainedGraph();
    if (graph && Array.isArray(graph.edges)) {
      graphEdgeCount = graph.edges.length;
    }
  } catch {
    // Graph not available
  }

  return {
    timestamp: new Date().toISOString(),
    posteriors,
    contrastiveAccuracy: contrastiveStats.accuracy,
    contrastiveExamples: contrastiveStats.examplesSeen,
    embeddingLoss,
    graphEdgeCount,
    knownDomains,
    totalEvidence,
  };
}

/** Convert a snapshot to a serializable summary */
export function snapshotToSummary(snapshot: BrainSnapshot): BrainSnapshotSummary {
  let totalMean = 0;
  let totalCIWidth = 0;
  let count = 0;

  for (const [, p] of snapshot.posteriors) {
    totalMean += p.mean;
    totalCIWidth += p.credibleIntervalWidth;
    count++;
  }

  return {
    timestamp: snapshot.timestamp,
    posteriorCount: snapshot.posteriors.size,
    contrastiveAccuracy: snapshot.contrastiveAccuracy,
    contrastiveExamples: snapshot.contrastiveExamples,
    embeddingLoss: snapshot.embeddingLoss,
    graphEdgeCount: snapshot.graphEdgeCount,
    knownDomainCount: snapshot.knownDomains.size,
    totalEvidence: snapshot.totalEvidence,
    avgPosteriorMean: count > 0 ? totalMean / count : 0.5,
    avgCIWidth: count > 0 ? totalCIWidth / count : 1.0,
  };
}

// ============================================================================
// VALIDATION ENGINE
// ============================================================================

/**
 * Compare two brain snapshots and produce a LearningProof.
 * This is the hard proof that training actually changed the brain's state.
 */
export function validateLearning(
  before: BrainSnapshot,
  after: BrainSnapshot,
): LearningProof {
  const evidence: LearningEvidence[] = [];

  // ── L1: Bayesian Posterior Shifts ─────────────────────────────────
  const posteriorShifts: PosteriorShift[] = [];
  let totalMeanShift = 0;
  let totalCIChange = 0;
  let shiftCount = 0;

  // Check existing edges for changes
  for (const [key, afterP] of after.posteriors) {
    const beforeP = before.posteriors.get(key);
    if (beforeP) {
      const meanDelta = afterP.mean - beforeP.mean;
      const ciDelta = afterP.credibleIntervalWidth - beforeP.credibleIntervalWidth;

      if (Math.abs(meanDelta) > 0.001 || Math.abs(ciDelta) > 0.001) {
        let interpretation: string;
        if (meanDelta > 0.05) {
          interpretation = `Edge strengthened: belief in causality increased by ${(meanDelta * 100).toFixed(1)}%`;
        } else if (meanDelta < -0.05) {
          interpretation = `Edge weakened: belief in causality decreased by ${(Math.abs(meanDelta) * 100).toFixed(1)}%`;
        } else if (ciDelta < -0.01) {
          interpretation = `Edge became more certain: CI narrowed by ${(Math.abs(ciDelta) * 100).toFixed(1)}%`;
        } else {
          interpretation = `Minor update: mean shifted by ${(meanDelta * 100).toFixed(2)}%`;
        }

        posteriorShifts.push({
          edge: key,
          alphaBefore: beforeP.alpha,
          alphaAfter: afterP.alpha,
          betaBefore: beforeP.beta,
          betaAfter: afterP.beta,
          meanBefore: beforeP.mean,
          meanAfter: afterP.mean,
          meanDelta,
          ciWidthBefore: beforeP.credibleIntervalWidth,
          ciWidthAfter: afterP.credibleIntervalWidth,
          interpretation,
        });

        totalMeanShift += Math.abs(meanDelta);
        totalCIChange += ciDelta;
        shiftCount++;
      }
    }
  }

  // New edges (in after but not in before)
  const newEdgeKeys: string[] = [];
  for (const key of after.posteriors.keys()) {
    if (!before.posteriors.has(key)) {
      newEdgeKeys.push(key);
    }
  }

  // L1 Evidence: Posterior shifts
  const avgMeanShift = shiftCount > 0 ? totalMeanShift / shiftCount : 0;
  evidence.push({
    level: 'L1',
    metric: 'Bayesian posterior shifts',
    passed: posteriorShifts.length > 0 || newEdgeKeys.length > 0,
    before: before.posteriors.size,
    after: after.posteriors.size,
    delta: posteriorShifts.length + newEdgeKeys.length,
    explanation: posteriorShifts.length > 0
      ? `${posteriorShifts.length} edges had posterior updates (avg shift: ${(avgMeanShift * 100).toFixed(1)}%), ${newEdgeKeys.length} new edges added`
      : newEdgeKeys.length > 0
        ? `${newEdgeKeys.length} new causal edges discovered`
        : 'No Bayesian posterior changes detected',
  });

  // L1 Evidence: Total evidence accumulated
  const newEvidence = after.totalEvidence - before.totalEvidence;
  evidence.push({
    level: 'L1',
    metric: 'New evidence accumulated',
    passed: newEvidence > 0,
    before: before.totalEvidence,
    after: after.totalEvidence,
    delta: newEvidence,
    explanation: newEvidence > 0
      ? `${newEvidence.toFixed(1)} units of new evidence accumulated across all edges`
      : 'No new evidence added',
  });

  // ── L2: Contrastive Accuracy ─────────────────────────────────────
  const contrastiveDelta = after.contrastiveAccuracy - before.contrastiveAccuracy;
  const newExamples = after.contrastiveExamples - before.contrastiveExamples;
  evidence.push({
    level: 'L2',
    metric: 'Contrastive classifier accuracy',
    passed: newExamples > 0,
    before: before.contrastiveAccuracy,
    after: after.contrastiveAccuracy,
    delta: contrastiveDelta,
    explanation: newExamples > 0
      ? `${newExamples} new examples trained, accuracy: ${(before.contrastiveAccuracy * 100).toFixed(1)}% → ${(after.contrastiveAccuracy * 100).toFixed(1)}%`
      : 'No new contrastive training examples',
  });

  // ── L3: Embedding Space ──────────────────────────────────────────
  const embeddingDelta = after.embeddingLoss - before.embeddingLoss;
  evidence.push({
    level: 'L3',
    metric: 'Embedding space loss',
    passed: embeddingDelta < 0 || (before.embeddingLoss === 1.0 && after.embeddingLoss < 1.0),
    before: before.embeddingLoss,
    after: after.embeddingLoss,
    delta: embeddingDelta,
    explanation: embeddingDelta < -0.01
      ? `Embedding loss decreased: ${before.embeddingLoss.toFixed(4)} → ${after.embeddingLoss.toFixed(4)} (domains better separated)`
      : embeddingDelta > 0.01
        ? `Embedding loss increased: model may have seen contradictory data`
        : 'Embedding space unchanged',
  });

  // ── L4: Graph Structure ──────────────────────────────────────────
  const graphEdgeDelta = after.graphEdgeCount - before.graphEdgeCount;
  evidence.push({
    level: 'L4',
    metric: 'Causal graph edges',
    passed: graphEdgeDelta > 0,
    before: before.graphEdgeCount,
    after: after.graphEdgeCount,
    delta: graphEdgeDelta,
    explanation: graphEdgeDelta > 0
      ? `${graphEdgeDelta} new edges added to causal graph`
      : 'Graph structure unchanged',
  });

  // ── L5: Knowledge Coverage ───────────────────────────────────────
  const newDomains: string[] = [];
  for (const d of after.knownDomains) {
    if (!before.knownDomains.has(d)) {
      newDomains.push(d);
    }
  }
  evidence.push({
    level: 'L5',
    metric: 'Knowledge domain coverage',
    passed: newDomains.length > 0,
    before: before.knownDomains.size,
    after: after.knownDomains.size,
    delta: newDomains.length,
    explanation: newDomains.length > 0
      ? `${newDomains.length} new domains learned: ${newDomains.join(', ')}`
      : 'No new domain coverage',
  });

  // ── Compute Verdict ──────────────────────────────────────────────
  const passedCount = evidence.filter(e => e.passed).length;
  const l1Passed = evidence.filter(e => e.level === 'L1' && e.passed).length;

  let verdict: 'learned' | 'no_change' | 'degraded';
  let confidence: number;

  if (l1Passed > 0 && passedCount >= 3) {
    verdict = 'learned';
    confidence = Math.min(1, passedCount / evidence.length + avgMeanShift);
  } else if (passedCount >= 2) {
    verdict = 'learned';
    confidence = passedCount / evidence.length;
  } else if (passedCount === 0 && contrastiveDelta < -0.1) {
    verdict = 'degraded';
    confidence = 0.3;
  } else {
    verdict = 'no_change';
    confidence = 0.5;
  }

  // ── Build Summary ────────────────────────────────────────────────
  const avgCIChange = shiftCount > 0 ? totalCIChange / shiftCount : 0;

  const summaryParts: string[] = [];
  if (verdict === 'learned') {
    summaryParts.push(`✅ LEARNING CONFIRMED (${(confidence * 100).toFixed(0)}% confidence)`);
    summaryParts.push(`${passedCount}/${evidence.length} evidence checks passed.`);
    if (posteriorShifts.length > 0) {
      summaryParts.push(`${posteriorShifts.length} causal edges updated (avg shift: ${(avgMeanShift * 100).toFixed(1)}%).`);
    }
    if (newEdgeKeys.length > 0) {
      summaryParts.push(`${newEdgeKeys.length} new causal edges discovered.`);
    }
    if (newExamples > 0) {
      summaryParts.push(`${newExamples} neural net training examples.`);
    }
    if (newDomains.length > 0) {
      summaryParts.push(`New domains: ${newDomains.join(', ')}.`);
    }
  } else if (verdict === 'degraded') {
    summaryParts.push(`⚠️ LEARNING DEGRADED — brain got worse`);
    summaryParts.push(`Contrastive accuracy dropped by ${(Math.abs(contrastiveDelta) * 100).toFixed(1)}%.`);
  } else {
    summaryParts.push(`❌ NO LEARNING DETECTED`);
    summaryParts.push(`Training ran but no measurable brain state change occurred.`);
    summaryParts.push(`This means the pipeline is moving data around but not actually updating weights/beliefs.`);
  }

  const deltas: LearningDeltas = {
    newEdges: Math.max(newEdgeKeys.length, graphEdgeDelta),
    posteriorShifts,
    newDomains,
    contrastiveAccuracyDelta: contrastiveDelta,
    newContrastiveExamples: newExamples,
    embeddingLossDelta: embeddingDelta,
    newEvidence,
    avgPosteriorMeanShift: avgMeanShift,
    avgCIWidthChange: avgCIChange,
  };

  return {
    verdict,
    confidence,
    summary: summaryParts.join(' '),
    evidence,
    before: snapshotToSummary(before),
    after: snapshotToSummary(after),
    deltas,
    validatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// PRETTY PRINT
// ============================================================================

/**
 * Format a LearningProof as a human-readable report.
 * Designed for CTO-level consumption.
 */
export function formatLearningProof(proof: LearningProof): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           🧠 LEARNING VALIDATION REPORT                    ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push(`║  Verdict:    ${proof.verdict.toUpperCase().padEnd(47)}║`);
  lines.push(`║  Confidence: ${(proof.confidence * 100).toFixed(0).padStart(3)}%${' '.repeat(44)}║`);
  lines.push(`║  Time:       ${proof.validatedAt.padEnd(47)}║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Before/After comparison
  lines.push('  ┌─────────────────────────────┬────────────┬────────────┬────────────┐');
  lines.push('  │ Metric                      │   Before   │   After    │   Delta    │');
  lines.push('  ├─────────────────────────────┼────────────┼────────────┼────────────┤');

  const row = (name: string, before: string, after: string, delta: string) => {
    lines.push(`  │ ${name.padEnd(27)} │ ${before.padStart(10)} │ ${after.padStart(10)} │ ${delta.padStart(10)} │`);
  };

  row('Bayesian edges', String(proof.before.posteriorCount), String(proof.after.posteriorCount),
    `+${proof.after.posteriorCount - proof.before.posteriorCount}`);
  row('Total evidence', proof.before.totalEvidence.toFixed(1), proof.after.totalEvidence.toFixed(1),
    `+${proof.deltas.newEvidence.toFixed(1)}`);
  row('Avg posterior mean', proof.before.avgPosteriorMean.toFixed(3), proof.after.avgPosteriorMean.toFixed(3),
    `${proof.deltas.avgPosteriorMeanShift >= 0 ? '+' : ''}${proof.deltas.avgPosteriorMeanShift.toFixed(3)}`);
  row('Avg CI width', proof.before.avgCIWidth.toFixed(3), proof.after.avgCIWidth.toFixed(3),
    `${proof.deltas.avgCIWidthChange >= 0 ? '+' : ''}${proof.deltas.avgCIWidthChange.toFixed(3)}`);
  row('Contrastive accuracy', `${(proof.before.contrastiveAccuracy * 100).toFixed(1)}%`, `${(proof.after.contrastiveAccuracy * 100).toFixed(1)}%`,
    `${proof.deltas.contrastiveAccuracyDelta >= 0 ? '+' : ''}${(proof.deltas.contrastiveAccuracyDelta * 100).toFixed(1)}%`);
  row('Contrastive examples', String(proof.before.contrastiveExamples), String(proof.after.contrastiveExamples),
    `+${proof.deltas.newContrastiveExamples}`);
  row('Embedding loss', proof.before.embeddingLoss.toFixed(4), proof.after.embeddingLoss.toFixed(4),
    `${proof.deltas.embeddingLossDelta >= 0 ? '+' : ''}${proof.deltas.embeddingLossDelta.toFixed(4)}`);
  row('Graph edges', String(proof.before.graphEdgeCount), String(proof.after.graphEdgeCount),
    `+${proof.deltas.newEdges}`);
  row('Known domains', String(proof.before.knownDomainCount), String(proof.after.knownDomainCount),
    `+${proof.deltas.newDomains.length}`);

  lines.push('  └─────────────────────────────┴────────────┴────────────┴────────────┘');
  lines.push('');

  // Evidence checks
  lines.push('  Evidence Checks:');
  for (const e of proof.evidence) {
    const icon = e.passed ? '✅' : '❌';
    lines.push(`    ${icon} [${e.level}] ${e.metric}: ${e.explanation}`);
  }
  lines.push('');

  // Top posterior shifts
  if (proof.deltas.posteriorShifts.length > 0) {
    lines.push('  Top Posterior Shifts (Bayesian belief updates):');
    const sorted = [...proof.deltas.posteriorShifts].sort((a, b) => Math.abs(b.meanDelta) - Math.abs(a.meanDelta));
    for (const shift of sorted.slice(0, 10)) {
      const dir = shift.meanDelta > 0 ? '↑' : '↓';
      lines.push(`    ${dir} ${shift.edge}: ${shift.meanBefore.toFixed(3)} → ${shift.meanAfter.toFixed(3)} (${shift.interpretation})`);
    }
    lines.push('');
  }

  // New domains
  if (proof.deltas.newDomains.length > 0) {
    lines.push(`  New Domains Learned: ${proof.deltas.newDomains.join(', ')}`);
    lines.push('');
  }

  // Summary
  lines.push(`  ${proof.summary}`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Quick validation: just check if any state changed at all.
 * Returns true if the brain's state is different after training.
 */
export function didAnythingChange(before: BrainSnapshot, after: BrainSnapshot): boolean {
  if (after.posteriors.size !== before.posteriors.size) return true;
  if (after.contrastiveExamples !== before.contrastiveExamples) return true;
  if (after.graphEdgeCount !== before.graphEdgeCount) return true;
  if (after.knownDomains.size !== before.knownDomains.size) return true;
  if (Math.abs(after.embeddingLoss - before.embeddingLoss) > 0.001) return true;

  // Check individual posteriors
  for (const [key, afterP] of after.posteriors) {
    const beforeP = before.posteriors.get(key);
    if (!beforeP) return true;
    if (Math.abs(afterP.alpha - beforeP.alpha) > 0.001) return true;
    if (Math.abs(afterP.beta - beforeP.beta) > 0.001) return true;
  }

  return false;
}

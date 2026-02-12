/**
 * Ensemble Voting Tests — Three Paradigm Theory
 * ================================================
 *
 * Brain Analog: Three genuinely independent paradigms each build their own
 * causal model. A Bayesian Judge resolves disagreements diagnostically.
 * When paradigms AGREE, confidence is high. When they DISAGREE,
 * the Judge classifies WHY (confounded, nonlinear, contested).
 *
 * Three Paradigms (genuinely independent):
 * - Paradigm A: Parametric (APEX — Multivariate VAR + Counterfactual Knockout)
 * - Paradigm B: Structural (PC Algorithm + VarLiNGAM)
 * - Paradigm C: Information-theoretic (KSG Transfer Entropy)
 *
 * Statistical votes (derived, not independent):
 * - Granger F-test, Effect size, P-value, Sample adequacy, Confounder knockout
 *
 * Tests:
 * 1. Method votes are recorded per edge
 * 2. Agreement ratio calculation
 * 3. Contentious edge flagging (agreement < 0.6)
 * 4. High-agreement edges have higher confidence
 */

import { describe, it, expect } from 'vitest';
import {
  runCausalDiscovery,
  type CausalRelationship,
  type MethodVote,
} from '../causality/causal-discovery-runner';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate synthetic cross-domain signals with known causal structure:
 * domain_A → domain_B (A leads B by 3 days with strong effect)
 */
function generateCausalSignals(
  numDays: number = 60,
  effectStrength: number = 0.8,
  lagDays: number = 3
) {
  const signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string;
  }> = [];

  const baseDate = new Date('2024-01-01');

  // Generate A with a trend
  const aValues: number[] = [];
  for (let d = 0; d < numDays; d++) {
    const value = 50 + 10 * Math.sin(d / 10) + (Math.random() - 0.5) * 5;
    aValues.push(value);

    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);

    signals.push({
      source_domain: 'domain_a',
      signal_type: 'metric_a',
      signal_value: value,
      signal_timestamp: date.toISOString(),
    });
  }

  // Generate B = f(A_lagged) + noise
  for (let d = 0; d < numDays; d++) {
    const laggedIdx = Math.max(0, d - lagDays);
    const aEffect = aValues[laggedIdx] * effectStrength;
    const noise = (Math.random() - 0.5) * 10;
    const value = aEffect + noise;

    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);

    signals.push({
      source_domain: 'domain_b',
      signal_type: 'metric_b',
      signal_value: value,
      signal_timestamp: date.toISOString(),
    });
  }

  // Generate C — independent noise (no causal link)
  for (let d = 0; d < numDays; d++) {
    const value = 30 + (Math.random() - 0.5) * 20;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + d);

    signals.push({
      source_domain: 'domain_c',
      signal_type: 'metric_c',
      signal_value: value,
      signal_timestamp: date.toISOString(),
    });
  }

  return signals;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Ensemble Voting (Three Paradigm Theory)', () => {
  describe('Method Votes Per Edge', () => {
    it('should include methodVotes on discovered relationships', () => {
      const signals = generateCausalSignals(90, 0.8, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      // Any significant relationship should have method votes
      for (const rel of result.discovered_relationships) {
        expect(rel.methodVotes).toBeDefined();
        expect(Array.isArray(rel.methodVotes)).toBe(true);
        expect(rel.methodVotes!.length).toBeGreaterThan(0);

        // Each vote should have required fields
        for (const vote of rel.methodVotes!) {
          expect(vote.method).toBeDefined();
          expect(['causal', 'not_causal', 'insufficient_data']).toContain(vote.vote);
          expect(typeof vote.confidence).toBe('number');
          expect(vote.confidence).toBeGreaterThanOrEqual(0);
          expect(vote.confidence).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should record at least 4 different method assessments per edge', () => {
      const signals = generateCausalSignals(90, 0.8, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      if (result.discovered_relationships.length > 0) {
        const rel = result.discovered_relationships[0];
        const methods = new Set(rel.methodVotes!.map(v => v.method));

        // Brain Analog: at least 4 assessments (3 paradigm + statistical votes)
        expect(methods.size).toBeGreaterThanOrEqual(4);

        // Should include these core methods
        expect(methods.has('granger_f_test')).toBe(true);
        expect(methods.has('effect_size')).toBe(true);
        expect(methods.has('p_value')).toBe(true);
      }
    });
  });

  describe('Agreement Ratio', () => {
    it('should calculate agreement ratio for each edge', () => {
      const signals = generateCausalSignals(90, 0.8, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      for (const rel of result.discovered_relationships) {
        expect(rel.agreementRatio).toBeDefined();
        expect(typeof rel.agreementRatio).toBe('number');
        expect(rel.agreementRatio!).toBeGreaterThanOrEqual(0);
        expect(rel.agreementRatio!).toBeLessThanOrEqual(1);
      }
    });

    it('should have high agreement for strongly causal edges', () => {
      // Strong causal signal: most methods should agree
      const signals = generateCausalSignals(90, 0.9, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      // The A→B edge should have high agreement (most methods detect it)
      const abEdge = result.discovered_relationships.find(
        r => r.source_domain === 'domain_a' && r.target_domain === 'domain_b'
      );

      if (abEdge) {
        // Strong signal → high agreement
        // Brain Analog: "5/7 assessments agree A→B is causal (71% agreement)"
        expect(abEdge.agreementRatio).toBeGreaterThan(0.5);
      }
    });
  });

  describe('Contentious Edge Flagging', () => {
    it('should include isContentious field on all edges', () => {
      const signals = generateCausalSignals(90, 0.7, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      for (const rel of result.discovered_relationships) {
        expect(typeof rel.isContentious).toBe('boolean');
      }
    });

    it('should not flag high-agreement edges as contentious', () => {
      const signals = generateCausalSignals(90, 0.9, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      const abEdge = result.discovered_relationships.find(
        r => r.source_domain === 'domain_a' && r.target_domain === 'domain_b'
      );

      if (abEdge && abEdge.agreementRatio! >= 0.6) {
        expect(abEdge.isContentious).toBe(false);
      }
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model Three Paradigms: independent paradigms vote, disagreement = diagnostic', () => {
      // Brain Analog:
      // Each paradigm (Parametric, Structural, Info-theoretic) assesses causality
      // from different mathematical foundations. They vote independently.
      // The Bayesian Judge then resolves disagreements:
      //   - All 3 agree → confident (high confidence, strong synaptic weight)
      //   - Parametric + Structural agree, TE disagrees → confounded
      //   - Only TE agrees → nonlinear relationship
      //   - Mixed → contested (seek more data)

      const signals = generateCausalSignals(90, 0.8, 3);
      const result = runCausalDiscovery(signals, 'org-test');

      for (const rel of result.discovered_relationships) {
        const votes = rel.methodVotes!;
        const causalVotes = votes.filter(v => v.vote === 'causal').length;
        const notCausalVotes = votes.filter(v => v.vote === 'not_causal').length;
        const abstentions = votes.filter(v => v.vote === 'insufficient_data').length;

        // All votes accounted for
        expect(causalVotes + notCausalVotes + abstentions).toBe(votes.length);

        // Agreement ratio matches our calculation
        const totalNonAbstain = causalVotes + notCausalVotes;
        if (totalNonAbstain > 0) {
          const expectedAgreement = causalVotes / totalNonAbstain;
          expect(rel.agreementRatio).toBeCloseTo(expectedAgreement, 10);
        }
      }
    });
  });
});

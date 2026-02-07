/**
 * Nexus Memory Stack - Temporal Memory Tests
 *
 * Tests for the temporal memory decay, reinforcement, and lifecycle functions.
 * Validates exponential decay, spaced repetition, feedback reinforcement,
 * relevance scoring, pruning, and memory consolidation.
 */

import { describe, it, expect } from 'vitest';
import {
  createTemporalMemory,
  applyTemporalDecay,
  recordAccess,
  batchApplyDecay,
  reinforceMemory,
  computeAccuracy,
  computeFinalRelevance,
  rankByRelevance,
  identifyPrunable,
  consolidateMemories,
  DEFAULT_TEMPORAL_CONFIG,
} from '../core/embeddings/temporal-memory';
import type {
  TemporalMemory,
  MemoryFeedback,
  TemporalMemoryConfig,
} from '../core/embeddings/temporal-memory';

// ============================================================================
// HELPERS
// ============================================================================

/** Create a memory with lastAccessedAt set to a specific number of days ago */
function createAgedMemory(
  id: string,
  type: Parameters<typeof createTemporalMemory>[1],
  daysAgo: number,
  overrides: Partial<TemporalMemory> = {}
): TemporalMemory {
  const memory = createTemporalMemory(id, type, `content-${id}`);
  memory.lastAccessedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { ...memory, ...overrides };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Temporal Memory', () => {
  // ==========================================================================
  // createTemporalMemory
  // ==========================================================================

  describe('createTemporalMemory', () => {
    it('should create a memory with correct defaults', () => {
      const memory = createTemporalMemory('mem-1', 'fact', { key: 'value' });

      expect(memory.id).toBe('mem-1');
      expect(memory.type).toBe('fact');
      expect(memory.content).toEqual({ key: 'value' });
      expect(memory.embedding).toBeUndefined();
      expect(memory.accessCount).toBe(0);
      expect(memory.baseRelevance).toBe(1.0);
      expect(memory.currentRelevance).toBe(1.0);
      expect(memory.decayRate).toBe(DEFAULT_TEMPORAL_CONFIG.decayRate);
      expect(memory.reinforcementScore).toBe(0);
      expect(memory.positiveFeedbackCount).toBe(0);
      expect(memory.negativeFeedbackCount).toBe(0);
      expect(memory.accuracyHistory).toEqual([]);
    });

    it('should set createdAt and lastAccessedAt to the current time', () => {
      const before = Date.now();
      const memory = createTemporalMemory('mem-2', 'pattern', 'some pattern');
      const after = Date.now();

      expect(memory.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(memory.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(memory.lastAccessedAt.getTime()).toBe(memory.createdAt.getTime());
    });

    it('should support all memory types', () => {
      const types = ['fact', 'pattern', 'prediction', 'insight', 'rule', 'anomaly'] as const;
      for (const type of types) {
        const memory = createTemporalMemory(`mem-${type}`, type, `content for ${type}`);
        expect(memory.type).toBe(type);
      }
    });

    it('should store an optional embedding', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4];
      const memory = createTemporalMemory('mem-emb', 'fact', 'embedded', embedding);

      expect(memory.embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should handle complex content objects', () => {
      const content = { nested: { deep: [1, 2, 3] }, flag: true };
      const memory = createTemporalMemory('mem-complex', 'insight', content);

      expect(memory.content).toEqual(content);
    });
  });

  // ==========================================================================
  // DEFAULT_TEMPORAL_CONFIG
  // ==========================================================================

  describe('DEFAULT_TEMPORAL_CONFIG', () => {
    it('should have correct half-life values for all memory types', () => {
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.fact).toBe(365);
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.pattern).toBe(90);
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.prediction).toBe(30);
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.insight).toBe(60);
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.rule).toBe(180);
      expect(DEFAULT_TEMPORAL_CONFIG.halfLifeDays.anomaly).toBe(7);
    });

    it('should have a minimum relevance floor', () => {
      expect(DEFAULT_TEMPORAL_CONFIG.minRelevance).toBe(0.1);
    });

    it('should have reinforcement boost greater than 1 and penalty less than 1', () => {
      expect(DEFAULT_TEMPORAL_CONFIG.reinforcementBoost).toBeGreaterThan(1);
      expect(DEFAULT_TEMPORAL_CONFIG.reinforcementPenalty).toBeLessThan(1);
    });
  });

  // ==========================================================================
  // applyTemporalDecay
  // ==========================================================================

  describe('applyTemporalDecay', () => {
    it('should minimally decay a recently accessed fact', () => {
      const memory = createTemporalMemory('fact-recent', 'fact', 'a fact');
      // Just created, so lastAccessedAt is now
      const result = applyTemporalDecay(memory);

      // Very little time has passed, newRelevance should be close to 1.0
      expect(result.newRelevance).toBeGreaterThan(0.9);
      expect(result.daysSinceAccess).toBeLessThan(1);
      expect(result.decayFactor).toBeCloseTo(1.0, 2);
    });

    it('should decay a fact slowly over 365 days (half-life)', () => {
      const memory = createAgedMemory('fact-old', 'fact', 365);
      const result = applyTemporalDecay(memory);

      // After one half-life, decayFactor should be ~0.5
      expect(result.decayFactor).toBeCloseTo(0.5, 1);
      expect(result.daysSinceAccess).toBeCloseTo(365, 0);
    });

    it('should decay an anomaly rapidly (7-day half-life)', () => {
      const memory = createAgedMemory('anomaly-1', 'anomaly', 7);
      const result = applyTemporalDecay(memory);

      // After one half-life, decayFactor should be ~0.5
      expect(result.decayFactor).toBeCloseTo(0.5, 1);
    });

    it('should heavily decay an anomaly after 14 days (two half-lives)', () => {
      const memory = createAgedMemory('anomaly-2', 'anomaly', 14);
      const result = applyTemporalDecay(memory);

      // After two half-lives, decayFactor should be ~0.25
      expect(result.decayFactor).toBeCloseTo(0.25, 1);
    });

    it('should floor relevance at minRelevance', () => {
      // Anomaly 100 days old => extremely decayed
      const memory = createAgedMemory('anomaly-ancient', 'anomaly', 100);
      const result = applyTemporalDecay(memory);

      expect(result.newRelevance).toBeGreaterThanOrEqual(DEFAULT_TEMPORAL_CONFIG.minRelevance);
    });

    it('should set shouldPrune when relevance hits floor and accessCount < 3', () => {
      const memory = createAgedMemory('prunable', 'anomaly', 100);
      memory.accessCount = 0;
      const result = applyTemporalDecay(memory);

      expect(result.shouldPrune).toBe(true);
    });

    it('should NOT set shouldPrune if accessCount >= 3 even with low relevance', () => {
      const memory = createAgedMemory('not-prunable', 'anomaly', 100);
      memory.accessCount = 5;
      const result = applyTemporalDecay(memory);

      expect(result.shouldPrune).toBe(false);
    });

    it('should apply reinforcement boost to decayed relevance', () => {
      const memory = createAgedMemory('reinforced', 'pattern', 90);
      memory.reinforcementScore = 1.0; // Strong reinforcement

      const result = applyTemporalDecay(memory);

      // With reinforcementScore of 1.0, reinforcedRelevance = decayed * (1 + 1) = decayed * 2
      // Compared to a non-reinforced memory, this should be significantly higher
      const memoryNoReinforce = createAgedMemory('no-reinforce', 'pattern', 90);
      memoryNoReinforce.reinforcementScore = 0;
      const resultNoReinforce = applyTemporalDecay(memoryNoReinforce);

      expect(result.newRelevance).toBeGreaterThan(resultNoReinforce.newRelevance);
    });

    it('should return correct previousRelevance from memory', () => {
      const memory = createAgedMemory('prev-check', 'fact', 30);
      memory.currentRelevance = 0.75;
      const result = applyTemporalDecay(memory);

      expect(result.previousRelevance).toBe(0.75);
    });
  });

  // ==========================================================================
  // recordAccess
  // ==========================================================================

  describe('recordAccess', () => {
    it('should increment accessCount by 1', () => {
      const memory = createTemporalMemory('access-1', 'fact', 'content');
      const updated = recordAccess(memory);

      expect(updated.accessCount).toBe(memory.accessCount + 1);
    });

    it('should update lastAccessedAt to approximately now', () => {
      const memory = createAgedMemory('access-2', 'fact', 5);
      const before = Date.now();
      const updated = recordAccess(memory);
      const after = Date.now();

      expect(updated.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updated.lastAccessedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should apply spaced repetition bonus when accessed after a gap', () => {
      const memory = createAgedMemory('access-spaced', 'fact', 14);
      memory.baseRelevance = 1.0;
      const updated = recordAccess(memory);

      // 14 days gap: spacingBonus = min(14/7, 0.5) = 0.5
      // currentRelevance = min(1.0 * (1 + 0.5), 1.0) = 1.0 (capped)
      expect(updated.currentRelevance).toBeLessThanOrEqual(1.0);
      // reinforcementScore should have increased by spacingBonus * 0.1
      expect(updated.reinforcementScore).toBeGreaterThan(memory.reinforcementScore);
    });

    it('should cap spaced repetition bonus at 0.5', () => {
      // 30 days gap => spacingBonus = min(30/7, 0.5) = 0.5 (capped)
      const memory = createAgedMemory('access-long-gap', 'fact', 30);
      memory.baseRelevance = 0.6;
      const updated = recordAccess(memory);

      // currentRelevance = min(0.6 * (1 + 0.5), 1.0) = min(0.9, 1.0) = 0.9
      expect(updated.currentRelevance).toBeCloseTo(0.9, 1);
    });

    it('should cap currentRelevance at 1.0', () => {
      const memory = createAgedMemory('access-cap', 'fact', 14);
      memory.baseRelevance = 0.9;
      const updated = recordAccess(memory);

      // spacingBonus = 0.5, so 0.9 * 1.5 = 1.35 => capped at 1.0
      expect(updated.currentRelevance).toBeLessThanOrEqual(1.0);
    });

    it('should give minimal bonus for very recent access', () => {
      const memory = createTemporalMemory('access-recent', 'fact', 'content');
      // lastAccessedAt is just now, so daysSinceLastAccess ~= 0
      const updated = recordAccess(memory);

      // spacingBonus ~= 0, so currentRelevance ~= baseRelevance
      expect(updated.currentRelevance).toBeCloseTo(memory.baseRelevance, 1);
    });

    it('should not mutate the original memory', () => {
      const memory = createTemporalMemory('immutable', 'fact', 'content');
      const originalCount = memory.accessCount;
      recordAccess(memory);

      expect(memory.accessCount).toBe(originalCount);
    });
  });

  // ==========================================================================
  // batchApplyDecay
  // ==========================================================================

  describe('batchApplyDecay', () => {
    it('should apply decay to all memories in the batch', () => {
      const memories = [
        createAgedMemory('batch-1', 'fact', 10),
        createAgedMemory('batch-2', 'anomaly', 10),
        createAgedMemory('batch-3', 'pattern', 10),
      ];

      const results = batchApplyDecay(memories);

      expect(results).toHaveLength(3);
      for (const { result } of results) {
        expect(result).toHaveProperty('newRelevance');
        expect(result).toHaveProperty('decayFactor');
        expect(result).toHaveProperty('daysSinceAccess');
        expect(result).toHaveProperty('shouldPrune');
      }
    });

    it('should decay anomaly faster than fact in the same batch', () => {
      const factMemory = createAgedMemory('batch-fact', 'fact', 30);
      const anomalyMemory = createAgedMemory('batch-anomaly', 'anomaly', 30);

      const results = batchApplyDecay([factMemory, anomalyMemory]);

      const factResult = results[0].result;
      const anomalyResult = results[1].result;

      // Anomaly (7-day half-life) decays much faster than fact (365-day half-life)
      expect(anomalyResult.decayFactor).toBeLessThan(factResult.decayFactor);
    });

    it('should handle an empty array', () => {
      const results = batchApplyDecay([]);
      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // reinforceMemory
  // ==========================================================================

  describe('reinforceMemory', () => {
    it('should increase reinforcementScore with positive feedback', () => {
      const memory = createTemporalMemory('reinforce-pos', 'fact', 'content');
      const feedback: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 1.0,
      };

      const result = reinforceMemory(memory, feedback);

      expect(result.feedbackType).toBe('positive');
      expect(result.newScore).toBeGreaterThan(result.previousScore);
      expect(memory.positiveFeedbackCount).toBe(1);
    });

    it('should decrease reinforcementScore with negative feedback', () => {
      const memory = createTemporalMemory('reinforce-neg', 'fact', 'content');
      memory.reinforcementScore = 1.0;

      const feedback: MemoryFeedback = {
        isPositive: false,
        isNegative: true,
        confidence: 1.0,
      };

      const result = reinforceMemory(memory, feedback);

      expect(result.feedbackType).toBe('negative');
      expect(result.newScore).toBeLessThan(result.previousScore);
      expect(memory.negativeFeedbackCount).toBe(1);
    });

    it('should apply confidence weighting to the delta', () => {
      const memoryFull = createTemporalMemory('conf-full', 'fact', 'content');
      const memoryHalf = createTemporalMemory('conf-half', 'fact', 'content');

      const feedbackFull: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 1.0,
      };
      const feedbackHalf: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 0.5,
      };

      const resultFull = reinforceMemory(memoryFull, feedbackFull);
      const resultHalf = reinforceMemory(memoryHalf, feedbackHalf);

      // Half-confidence should produce roughly half the delta
      expect(resultHalf.reinforcementDelta).toBeCloseTo(
        resultFull.reinforcementDelta * 0.5,
        4
      );
    });

    it('should cap reinforcementScore at 2.0', () => {
      const memory = createTemporalMemory('cap-upper', 'fact', 'content');
      memory.reinforcementScore = 1.9;

      const feedback: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 1.0,
      };

      // Apply many positive feedbacks
      reinforceMemory(memory, feedback);
      reinforceMemory(memory, feedback);
      reinforceMemory(memory, feedback);

      expect(memory.reinforcementScore).toBeLessThanOrEqual(2.0);
    });

    it('should floor reinforcementScore at 0', () => {
      const memory = createTemporalMemory('cap-lower', 'fact', 'content');
      memory.reinforcementScore = 0.05;

      const feedback: MemoryFeedback = {
        isPositive: false,
        isNegative: true,
        confidence: 1.0,
      };

      reinforceMemory(memory, feedback);

      expect(memory.reinforcementScore).toBeGreaterThanOrEqual(0);
    });

    it('should push 1 to accuracyHistory on positive feedback', () => {
      const memory = createTemporalMemory('acc-pos', 'fact', 'content');
      const feedback: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 1.0,
      };

      reinforceMemory(memory, feedback);

      expect(memory.accuracyHistory).toContain(1);
    });

    it('should push 0 to accuracyHistory on negative feedback', () => {
      const memory = createTemporalMemory('acc-neg', 'fact', 'content');
      const feedback: MemoryFeedback = {
        isPositive: false,
        isNegative: true,
        confidence: 1.0,
      };

      reinforceMemory(memory, feedback);

      expect(memory.accuracyHistory).toContain(0);
    });

    it('should truncate accuracyHistory to 10 entries', () => {
      const memory = createTemporalMemory('acc-trunc', 'fact', 'content');
      memory.accuracyHistory = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]; // 10 entries

      const feedback: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 1.0,
      };

      reinforceMemory(memory, feedback); // 11th entry should trigger truncation

      expect(memory.accuracyHistory).toHaveLength(10);
      // The oldest entry (first 1) should have been sliced off, last entry should be 1
      expect(memory.accuracyHistory[memory.accuracyHistory.length - 1]).toBe(1);
    });

    it('should return neutral feedbackType when neither positive nor negative', () => {
      const memory = createTemporalMemory('neutral', 'fact', 'content');
      const feedback: MemoryFeedback = {
        isPositive: false,
        isNegative: false,
        confidence: 1.0,
      };

      const result = reinforceMemory(memory, feedback);

      expect(result.feedbackType).toBe('neutral');
      expect(result.reinforcementDelta).toBe(0);
    });
  });

  // ==========================================================================
  // computeAccuracy
  // ==========================================================================

  describe('computeAccuracy', () => {
    it('should return 0.5 for empty accuracy history (prior)', () => {
      const memory = createTemporalMemory('acc-empty', 'fact', 'content');
      expect(computeAccuracy(memory)).toBe(0.5);
    });

    it('should return 1.0 for all-positive history', () => {
      const memory = createTemporalMemory('acc-all-pos', 'fact', 'content');
      memory.accuracyHistory = [1, 1, 1, 1, 1];
      expect(computeAccuracy(memory)).toBe(1.0);
    });

    it('should return 0.0 for all-negative history', () => {
      const memory = createTemporalMemory('acc-all-neg', 'fact', 'content');
      memory.accuracyHistory = [0, 0, 0, 0, 0];
      expect(computeAccuracy(memory)).toBe(0.0);
    });

    it('should compute correct mean for mixed history', () => {
      const memory = createTemporalMemory('acc-mixed', 'fact', 'content');
      memory.accuracyHistory = [1, 0, 1, 0, 1]; // 3/5 = 0.6
      expect(computeAccuracy(memory)).toBeCloseTo(0.6, 5);
    });

    it('should handle a single entry', () => {
      const memory = createTemporalMemory('acc-single', 'fact', 'content');
      memory.accuracyHistory = [1];
      expect(computeAccuracy(memory)).toBe(1.0);
    });
  });

  // ==========================================================================
  // computeFinalRelevance
  // ==========================================================================

  describe('computeFinalRelevance', () => {
    it('should combine similarity, decay, reinforcement, frequency, and accuracy', () => {
      const memory = createTemporalMemory('final-1', 'fact', 'content');
      memory.accessCount = 5;
      memory.accuracyHistory = [1, 1, 1]; // accuracy = 1.0

      const score = computeFinalRelevance(memory, 0.8);

      // Should produce a positive number
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should return 0 when baseSimilarity is 0', () => {
      const memory = createTemporalMemory('final-zero', 'fact', 'content');
      const score = computeFinalRelevance(memory, 0);

      expect(score).toBe(0);
    });

    it('should be capped at 1.0', () => {
      const memory = createTemporalMemory('final-cap', 'fact', 'content');
      memory.accessCount = 100;
      memory.reinforcementScore = 2.0;
      memory.accuracyHistory = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

      const score = computeFinalRelevance(memory, 1.0);

      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should give higher score to memory with more access and accuracy', () => {
      const memoryGood = createTemporalMemory('good', 'fact', 'content');
      memoryGood.accessCount = 10;
      memoryGood.accuracyHistory = [1, 1, 1, 1, 1];

      const memoryBad = createTemporalMemory('bad', 'fact', 'content');
      memoryBad.accessCount = 0;
      memoryBad.accuracyHistory = [0, 0, 0, 0, 0];

      const scoreGood = computeFinalRelevance(memoryGood, 0.5);
      const scoreBad = computeFinalRelevance(memoryBad, 0.5);

      expect(scoreGood).toBeGreaterThan(scoreBad);
    });
  });

  // ==========================================================================
  // rankByRelevance
  // ==========================================================================

  describe('rankByRelevance', () => {
    it('should sort memories in descending order of relevance', () => {
      const mem1 = createTemporalMemory('rank-1', 'fact', 'content');
      const mem2 = createTemporalMemory('rank-2', 'fact', 'content');
      const mem3 = createTemporalMemory('rank-3', 'fact', 'content');

      // Give mem2 the highest similarity
      const similarities = new Map<string, number>([
        ['rank-1', 0.3],
        ['rank-2', 0.9],
        ['rank-3', 0.6],
      ]);

      const ranked = rankByRelevance([mem1, mem2, mem3], similarities);

      expect(ranked[0].id).toBe('rank-2');
      expect(ranked[1].id).toBe('rank-3');
      expect(ranked[2].id).toBe('rank-1');
    });

    it('should handle missing similarities by defaulting to 0', () => {
      const mem1 = createTemporalMemory('present', 'fact', 'content');
      const mem2 = createTemporalMemory('missing', 'fact', 'content');

      const similarities = new Map<string, number>([
        ['present', 0.8],
        // 'missing' has no entry
      ]);

      const ranked = rankByRelevance([mem1, mem2], similarities);

      // Memory with known similarity should rank higher
      expect(ranked[0].id).toBe('present');
      expect(ranked[1].id).toBe('missing');
    });

    it('should handle an empty memories array', () => {
      const ranked = rankByRelevance([], new Map());
      expect(ranked).toEqual([]);
    });
  });

  // ==========================================================================
  // identifyPrunable
  // ==========================================================================

  describe('identifyPrunable', () => {
    it('should identify memories with low relevance and low access count as prunable', () => {
      // Very old anomaly with no accesses
      const memory = createAgedMemory('prunable-1', 'anomaly', 100, {
        accessCount: 0,
      });

      const prunable = identifyPrunable([memory]);

      expect(prunable).toHaveLength(1);
      expect(prunable[0].id).toBe('prunable-1');
    });

    it('should NOT identify high-access memories as prunable even with low relevance', () => {
      const memory = createAgedMemory('high-access', 'anomaly', 100, {
        accessCount: 10,
      });

      const prunable = identifyPrunable([memory]);

      expect(prunable).toHaveLength(0);
    });

    it('should NOT identify fresh memories as prunable', () => {
      const memory = createTemporalMemory('fresh', 'anomaly', 'content');
      // Just created, relevance is 1.0

      const prunable = identifyPrunable([memory]);

      expect(prunable).toHaveLength(0);
    });

    it('should identify multiple prunable memories from a mixed set', () => {
      const prunableAnomaly = createAgedMemory('prune-anomaly', 'anomaly', 200, {
        accessCount: 0,
      });
      const prunablePrediction = createAgedMemory('prune-prediction', 'prediction', 500, {
        accessCount: 1,
      });
      const notPrunable = createTemporalMemory('keep', 'fact', 'content');

      const prunable = identifyPrunable([prunableAnomaly, prunablePrediction, notPrunable]);

      const prunableIds = prunable.map(m => m.id);
      expect(prunableIds).toContain('prune-anomaly');
      expect(prunableIds).not.toContain('keep');
    });
  });

  // ==========================================================================
  // consolidateMemories
  // ==========================================================================

  describe('consolidateMemories', () => {
    it('should return memories unchanged when they have no embeddings', () => {
      const mem1 = createTemporalMemory('no-emb-1', 'fact', 'content-a');
      const mem2 = createTemporalMemory('no-emb-2', 'fact', 'content-b');

      const result = consolidateMemories([mem1, mem2]);

      expect(result).toHaveLength(2);
    });

    it('should merge memories with nearly identical embeddings', () => {
      const embedding = [1, 0, 0, 0];
      const mem1 = createTemporalMemory('dup-1', 'fact', 'content-a', embedding);
      mem1.accessCount = 3;
      mem1.positiveFeedbackCount = 2;

      const mem2 = createTemporalMemory('dup-2', 'fact', 'content-b', embedding);
      mem2.accessCount = 5;
      mem2.positiveFeedbackCount = 1;

      // Identical embeddings => cosine similarity = 1.0 > 0.95 threshold
      const result = consolidateMemories([mem1, mem2]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('dup-1'); // Primary retains its id
      expect(result[0].accessCount).toBe(8); // 3 + 5
      expect(result[0].positiveFeedbackCount).toBe(3); // 2 + 1
    });

    it('should keep memories with dissimilar embeddings separate', () => {
      const mem1 = createTemporalMemory('diff-1', 'fact', 'content-a', [1, 0, 0]);
      const mem2 = createTemporalMemory('diff-2', 'fact', 'content-b', [0, 1, 0]);

      // Cosine similarity of [1,0,0] and [0,1,0] = 0 < 0.95
      const result = consolidateMemories([mem1, mem2]);

      expect(result).toHaveLength(2);
    });

    it('should take max reinforcementScore during merge', () => {
      const embedding = [0.5, 0.5, 0.5];
      const mem1 = createTemporalMemory('merge-r1', 'fact', 'a', embedding);
      mem1.reinforcementScore = 0.3;

      const mem2 = createTemporalMemory('merge-r2', 'fact', 'b', embedding);
      mem2.reinforcementScore = 0.8;

      const result = consolidateMemories([mem1, mem2]);

      expect(result[0].reinforcementScore).toBe(0.8);
    });

    it('should combine and truncate accuracy histories during merge', () => {
      const embedding = [1, 0, 0];
      const mem1 = createTemporalMemory('hist-1', 'fact', 'a', embedding);
      mem1.accuracyHistory = [1, 1, 1, 1, 1, 1];

      const mem2 = createTemporalMemory('hist-2', 'fact', 'b', embedding);
      mem2.accuracyHistory = [0, 0, 0, 0, 0, 0];

      const result = consolidateMemories([mem1, mem2]);

      // Combined = [1,1,1,1,1,1,0,0,0,0,0,0] => sliced to last 10
      expect(result[0].accuracyHistory).toHaveLength(10);
    });

    it('should handle a single memory without error', () => {
      const mem = createTemporalMemory('solo', 'fact', 'content', [1, 0]);
      const result = consolidateMemories([mem]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('solo');
    });

    it('should handle empty array', () => {
      const result = consolidateMemories([]);
      expect(result).toEqual([]);
    });

    it('should consolidate three similar memories into one', () => {
      const embedding = [0.9, 0.1, 0.0];
      const mem1 = createTemporalMemory('triple-1', 'fact', 'a', embedding);
      mem1.accessCount = 1;

      const mem2 = createTemporalMemory('triple-2', 'fact', 'b', embedding);
      mem2.accessCount = 2;

      const mem3 = createTemporalMemory('triple-3', 'fact', 'c', embedding);
      mem3.accessCount = 3;

      const result = consolidateMemories([mem1, mem2, mem3]);

      expect(result).toHaveLength(1);
      expect(result[0].accessCount).toBe(6); // 1 + 2 + 3
    });

    it('should respect a custom similarity threshold', () => {
      // Two embeddings that are somewhat similar but not identical
      const mem1 = createTemporalMemory('thresh-1', 'fact', 'a', [1, 0.1, 0]);
      const mem2 = createTemporalMemory('thresh-2', 'fact', 'b', [1, 0.2, 0]);

      // With a very high threshold, they should remain separate
      const highThreshold = consolidateMemories([mem1, mem2], 0.999);
      expect(highThreshold).toHaveLength(2);

      // With a lower threshold, they might merge (these are very similar)
      const lowThreshold = consolidateMemories([mem1, mem2], 0.9);
      expect(lowThreshold).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle zero-confidence feedback without changing score', () => {
      const memory = createTemporalMemory('zero-conf', 'fact', 'content');
      const feedback: MemoryFeedback = {
        isPositive: true,
        isNegative: false,
        confidence: 0,
      };

      const result = reinforceMemory(memory, feedback);

      // delta *= 0 confidence => delta = 0
      expect(result.reinforcementDelta).toBe(0);
      expect(result.newScore).toBe(result.previousScore);
    });

    it('should handle a memory with very large accessCount gracefully', () => {
      const memory = createTemporalMemory('large-access', 'fact', 'content');
      memory.accessCount = 1_000_000;

      // computeFinalRelevance uses log(1 + accessCount) / 10
      const score = computeFinalRelevance(memory, 0.5);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThan(0);
    });

    it('should handle negative daysSinceAccess (future date) gracefully', () => {
      const memory = createTemporalMemory('future', 'fact', 'content');
      // Set lastAccessedAt to the future
      memory.lastAccessedAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = applyTemporalDecay(memory);

      // Negative days => exp(positive) => decayFactor > 1 => relevance boosted
      expect(result.daysSinceAccess).toBeLessThan(0);
      expect(result.decayFactor).toBeGreaterThan(1);
      expect(Number.isFinite(result.newRelevance)).toBe(true);
    });
  });
});

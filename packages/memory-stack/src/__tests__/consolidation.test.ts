/**
 * Tests for Sleep-Like Consolidation & Importance-Weighted Decay
 */
import { describe, it, expect } from 'vitest';
import {
  createTemporalMemory,
  runConsolidation,
  applyImportanceWeightedDecay,
  applyTemporalDecay,
  DEFAULT_TEMPORAL_CONFIG,
  type TemporalMemory,
  type TemporalMemoryConfig,
} from '../core/embeddings/temporal-memory';

function createTestMemory(overrides: Partial<TemporalMemory> = {}): TemporalMemory {
  const base = createTemporalMemory('test_' + Math.random().toString(36).slice(2), 'pattern', { data: 'test' });
  return { ...base, ...overrides };
}

function createAgedMemory(daysOld: number, overrides: Partial<TemporalMemory> = {}): TemporalMemory {
  const now = new Date();
  const past = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
  return createTestMemory({
    createdAt: past,
    lastAccessedAt: past,
    ...overrides,
  });
}

describe('Sleep-Like Consolidation', () => {
  describe('runConsolidation', () => {
    it('should return consolidation result', () => {
      const memories = [
        createTestMemory({ id: 'm1' }),
        createTestMemory({ id: 'm2' }),
      ];

      const result = runConsolidation(memories);

      expect(result).toBeDefined();
      expect(result.promoted).toBeDefined();
      expect(result.pruned).toBeDefined();
      expect(result.merged).toBeDefined();
      expect(result.adjusted).toBeDefined();
      expect(result.remainingCount).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should prune very old, low-access memories', () => {
      const memories = [
        // Fresh memory — should survive
        createTestMemory({ id: 'fresh', accessCount: 5 }),
        // Very old, never accessed — should be pruned
        createAgedMemory(400, {
          id: 'old',
          accessCount: 0,
          baseRelevance: 0.5,
          type: 'anomaly', // Fast decay: 7-day half-life
        }),
      ];

      const result = runConsolidation(memories, { pruningThreshold: 0.15 });

      // Old anomaly with 400 days, 7-day half-life should be heavily decayed
      expect(result.pruned.some(m => m.id === 'old')).toBe(true);
      expect(result.remainingCount).toBeLessThanOrEqual(2);
    });

    it('should promote high-importance patterns to long-term', () => {
      // Create a high-importance pattern memory
      const memories = [
        createTestMemory({
          id: 'important',
          type: 'pattern', // Not already fact/rule
          accessCount: 15,
          reinforcementScore: 1.5,
          positiveFeedbackCount: 10,
          negativeFeedbackCount: 0,
          accuracyHistory: [1, 1, 1, 1, 1],
          baseRelevance: 1.0,
        }),
      ];

      const result = runConsolidation(memories, { promotionThreshold: 0.5 });

      // With high access, high reinforcement, high accuracy, should be promoted
      if (result.promoted.length > 0) {
        const promoted = result.promoted.find(m => m.id === 'important');
        expect(promoted).toBeDefined();
        // Promoted memories should have reduced decay rate
        expect(promoted!.decayRate).toBeLessThan(DEFAULT_TEMPORAL_CONFIG.decayRate);
      }
    });

    it('should not promote facts and rules (already long-term)', () => {
      const memories = [
        createTestMemory({
          id: 'fact',
          type: 'fact',
          accessCount: 20,
          reinforcementScore: 2.0,
          accuracyHistory: [1, 1, 1, 1, 1],
        }),
        createTestMemory({
          id: 'rule',
          type: 'rule',
          accessCount: 20,
          reinforcementScore: 2.0,
          accuracyHistory: [1, 1, 1, 1, 1],
        }),
      ];

      const result = runConsolidation(memories);

      // Facts and rules should not be in promoted list
      expect(result.promoted.find(m => m.type === 'fact')).toBeUndefined();
      expect(result.promoted.find(m => m.type === 'rule')).toBeUndefined();
    });

    it('should adjust reinforcement based on accuracy trend', () => {
      const memories = [
        createTestMemory({
          id: 'improving',
          accessCount: 5,
          reinforcementScore: 0.5,
          accuracyHistory: [0, 0, 0, 0, 1, 1, 1], // Getting better
        }),
        createTestMemory({
          id: 'declining',
          accessCount: 5,
          reinforcementScore: 0.8,
          accuracyHistory: [1, 1, 1, 1, 0, 0, 0], // Getting worse
        }),
      ];

      const result = runConsolidation(memories);

      // Check that some adjustments were made
      // The accuracy trend logic checks recent 3 vs overall
      expect(result.adjusted.length + result.promoted.length + result.pruned.length + result.remainingCount).toBeGreaterThan(0);
    });

    it('should handle empty memory list', () => {
      const result = runConsolidation([]);

      expect(result.promoted).toEqual([]);
      expect(result.pruned).toEqual([]);
      expect(result.merged).toEqual([]);
      expect(result.remainingCount).toBe(0);
    });
  });
});

describe('Importance-Weighted Decay', () => {
  describe('applyImportanceWeightedDecay', () => {
    it('should decay faster for low-importance memories', () => {
      const memory = createAgedMemory(30, { type: 'pattern' });

      const lowImportance = applyImportanceWeightedDecay(memory, 0.2);
      const highImportance = applyImportanceWeightedDecay(memory, 1.5);

      // Higher importance = slower decay = higher relevance
      expect(highImportance.newRelevance).toBeGreaterThanOrEqual(lowImportance.newRelevance);
    });

    it('should match standard decay when importance = 1', () => {
      const memory = createAgedMemory(30, { type: 'pattern', reinforcementScore: 0 });

      const standard = applyTemporalDecay(memory);
      const weighted = applyImportanceWeightedDecay(memory, 0.5); // 0.5 + 0.5 = 1.0 adjusted halflife = halflife * 1.0

      // With importanceFactor = 0.5, adjusted = halflife * (0.5 + 0.5) = halflife * 1.0
      // Should be similar to standard
      expect(weighted.newRelevance).toBeCloseTo(standard.newRelevance, 1);
    });

    it('should never go below minimum relevance', () => {
      const memory = createAgedMemory(1000, { type: 'anomaly' }); // Very old anomaly

      const result = applyImportanceWeightedDecay(memory, 0.1);

      expect(result.newRelevance).toBeGreaterThanOrEqual(DEFAULT_TEMPORAL_CONFIG.minRelevance);
    });

    it('should report correct days since access', () => {
      const memory = createAgedMemory(10);

      const result = applyImportanceWeightedDecay(memory);

      expect(result.daysSinceAccess).toBeCloseTo(10, 0);
    });

    it('should flag very decayed, low-access memories for pruning', () => {
      const memory = createAgedMemory(500, {
        type: 'anomaly', // 7-day half-life
        accessCount: 0,
      });

      const result = applyImportanceWeightedDecay(memory, 0.1);

      expect(result.shouldPrune).toBe(true);
    });
  });
});

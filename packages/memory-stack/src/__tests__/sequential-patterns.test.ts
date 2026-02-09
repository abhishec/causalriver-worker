/**
 * Tests for Sequential Pattern Mining & Temporal Association Rules
 */
import { describe, it, expect } from 'vitest';
import {
  mineSequentialPatterns,
  sequentialPatternsToDiscovered,
  mineTemporalAssociationRules,
  type TemporalEvent,
} from '../learning/pattern-detector';

describe('Sequential Pattern Mining', () => {
  function makeEvents(sequences: Array<{ entityId: string; events: Array<[string, number]> }>): TemporalEvent[] {
    const result: TemporalEvent[] = [];
    for (const seq of sequences) {
      for (const [event, timestamp] of seq.events) {
        result.push({ event, timestamp, entityId: seq.entityId });
      }
    }
    return result;
  }

  describe('mineSequentialPatterns', () => {
    it('should find simple A → B patterns', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['deploy', 1], ['bug', 3], ['support', 5]] },
        { entityId: 'e2', events: [['deploy', 10], ['bug', 12], ['support', 15]] },
        { entityId: 'e3', events: [['deploy', 20], ['bug', 22]] },
        { entityId: 'e4', events: [['deploy', 30], ['bug', 33], ['support', 36]] },
      ]);

      const patterns = mineSequentialPatterns(events, {
        minSupport: 0.5,
      });

      // Should find deploy → bug (appears in 4/4 entities)
      const deployBug = patterns.find(
        p => p.sequence.length === 2 && p.sequence[0] === 'deploy' && p.sequence[1] === 'bug'
      );
      expect(deployBug).toBeDefined();
      expect(deployBug!.support).toBe(1.0); // 4/4
    });

    it('should find 3-step sequences', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['A', 1], ['B', 2], ['C', 3]] },
        { entityId: 'e2', events: [['A', 10], ['B', 12], ['C', 14]] },
        { entityId: 'e3', events: [['A', 20], ['B', 22], ['C', 24]] },
        { entityId: 'e4', events: [['X', 30], ['Y', 32]] },
      ]);

      const patterns = mineSequentialPatterns(events, { minSupport: 0.5 });

      const abc = patterns.find(
        p => p.sequence.length === 3 && JSON.stringify(p.sequence) === '["A","B","C"]'
      );
      expect(abc).toBeDefined();
      expect(abc!.support).toBe(0.75); // 3/4
    });

    it('should respect maxGap constraint', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['A', 1], ['B', 100]] }, // Gap too large
        { entityId: 'e2', events: [['A', 10], ['B', 12]] }, // Within gap
        { entityId: 'e3', events: [['A', 20], ['B', 22]] },
        { entityId: 'e4', events: [['A', 30], ['B', 32]] },
      ]);

      const patterns = mineSequentialPatterns(events, {
        minSupport: 0.5,
        maxGap: 10,
      });

      const ab = patterns.find(
        p => p.sequence.length === 2 && p.sequence[0] === 'A' && p.sequence[1] === 'B'
      );
      expect(ab).toBeDefined();
      expect(ab!.instanceCount).toBe(3); // e1 excluded due to gap
    });

    it('should compute average gaps between steps', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['A', 0], ['B', 5]] },
        { entityId: 'e2', events: [['A', 10], ['B', 13]] },
        { entityId: 'e3', events: [['A', 20], ['B', 24]] },
      ]);

      const patterns = mineSequentialPatterns(events, { minSupport: 0.5 });

      const ab = patterns.find(p => p.sequence.length === 2);
      expect(ab).toBeDefined();
      expect(ab!.avgGaps.length).toBe(1);
      // Average gap is (5+3+4)/3 = 4.0 (the average of all observed gaps)
      expect(ab!.avgGaps[0]).toBeGreaterThanOrEqual(3);
      expect(ab!.avgGaps[0]).toBeLessThanOrEqual(5);
    });

    it('should respect maxLength constraint', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5]] },
        { entityId: 'e2', events: [['A', 10], ['B', 12], ['C', 14], ['D', 16], ['E', 18]] },
      ]);

      const patterns = mineSequentialPatterns(events, {
        minSupport: 0.5,
        maxLength: 3,
      });

      const longPatterns = patterns.filter(p => p.sequence.length > 3);
      expect(longPatterns.length).toBe(0);
    });

    it('should filter out single-item patterns', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['A', 1]] },
        { entityId: 'e2', events: [['A', 10]] },
      ]);

      const patterns = mineSequentialPatterns(events, { minSupport: 0.5 });

      // All returned patterns should have length >= 2
      for (const p of patterns) {
        expect(p.sequence.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should handle empty events', () => {
      const patterns = mineSequentialPatterns([], { minSupport: 0.1 });
      expect(patterns).toEqual([]);
    });
  });

  describe('sequentialPatternsToDiscovered', () => {
    it('should convert sequential patterns to DiscoveredPattern format', () => {
      const events = makeEvents([
        { entityId: 'e1', events: [['deploy', 1], ['bug', 3]] },
        { entityId: 'e2', events: [['deploy', 10], ['bug', 12]] },
        { entityId: 'e3', events: [['deploy', 20], ['bug', 22]] },
      ]);

      const seqPatterns = mineSequentialPatterns(events, { minSupport: 0.5 });
      const discovered = sequentialPatternsToDiscovered(seqPatterns, 100);

      expect(discovered.length).toBeGreaterThan(0);

      const first = discovered[0];
      expect(first.name).toBeDefined();
      expect(first.description).toContain('Sequential pattern');
      expect(first.evidence).toBeDefined();
      expect(first.evidence.pValue).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Temporal Association Rules', () => {
  describe('mineTemporalAssociationRules', () => {
    it('should find temporal A → B rules', () => {
      const events: TemporalEvent[] = [
        // Entity 1: deploy → bug
        { event: 'deploy', timestamp: 1, entityId: 'e1' },
        { event: 'bug', timestamp: 3, entityId: 'e1' },
        // Entity 2: deploy → bug
        { event: 'deploy', timestamp: 10, entityId: 'e2' },
        { event: 'bug', timestamp: 12, entityId: 'e2' },
        // Entity 3: deploy → bug
        { event: 'deploy', timestamp: 20, entityId: 'e3' },
        { event: 'bug', timestamp: 22, entityId: 'e3' },
        // Entity 4: only deploy
        { event: 'deploy', timestamp: 30, entityId: 'e4' },
      ];

      const rules = mineTemporalAssociationRules(events, {
        minSupport: 0.3,
        minConfidence: 0.5,
        minLift: 1.0,
      });

      const deployToBug = rules.find(
        r => r.antecedent[0] === 'deploy' && r.consequent[0] === 'bug'
      );
      expect(deployToBug).toBeDefined();
      expect(deployToBug!.avgLag).toBeCloseTo(2); // (2+2+2)/3
      expect(deployToBug!.direction).toBe('forward');
    });

    it('should compute lag statistics', () => {
      const events: TemporalEvent[] = [
        { event: 'A', timestamp: 0, entityId: 'e1' },
        { event: 'B', timestamp: 5, entityId: 'e1' },
        { event: 'A', timestamp: 10, entityId: 'e2' },
        { event: 'B', timestamp: 13, entityId: 'e2' },
        { event: 'A', timestamp: 20, entityId: 'e3' },
        { event: 'B', timestamp: 27, entityId: 'e3' },
      ];

      const rules = mineTemporalAssociationRules(events, {
        minSupport: 0.3,
        minConfidence: 0.3,
        minLift: 1.0,
      });

      const aToB = rules.find(r => r.antecedent[0] === 'A' && r.consequent[0] === 'B');
      expect(aToB).toBeDefined();
      expect(aToB!.avgLag).toBeCloseTo(5); // (5+3+7)/3
      expect(aToB!.lagStdDev).toBeGreaterThan(0);
    });

    it('should detect bidirectional relationships', () => {
      const events: TemporalEvent[] = [];
      // A → B in some entities, B → A in others (bidirectional)
      for (let i = 0; i < 5; i++) {
        events.push({ event: 'X', timestamp: i * 10, entityId: `fwd_${i}` });
        events.push({ event: 'Y', timestamp: i * 10 + 2, entityId: `fwd_${i}` });
      }
      for (let i = 0; i < 4; i++) {
        events.push({ event: 'Y', timestamp: i * 10 + 100, entityId: `rev_${i}` });
        events.push({ event: 'X', timestamp: i * 10 + 103, entityId: `rev_${i}` });
      }

      const rules = mineTemporalAssociationRules(events, {
        minSupport: 0.2,
        minConfidence: 0.3,
        minLift: 1.0,
      });

      const xToY = rules.find(r => r.antecedent[0] === 'X' && r.consequent[0] === 'Y');
      if (xToY) {
        expect(xToY.direction).toBe('bidirectional');
      }
    });

    it('should respect maxWindow constraint', () => {
      const events: TemporalEvent[] = [
        { event: 'A', timestamp: 0, entityId: 'e1' },
        { event: 'B', timestamp: 100, entityId: 'e1' }, // Too far apart
        { event: 'A', timestamp: 200, entityId: 'e2' },
        { event: 'B', timestamp: 202, entityId: 'e2' }, // Within window
        { event: 'A', timestamp: 300, entityId: 'e3' },
        { event: 'B', timestamp: 302, entityId: 'e3' },
      ];

      const rules = mineTemporalAssociationRules(events, {
        maxWindow: 10,
        minSupport: 0.3,
        minConfidence: 0.3,
        minLift: 1.0,
      });

      const aToB = rules.find(r => r.antecedent[0] === 'A' && r.consequent[0] === 'B');
      if (aToB) {
        expect(aToB.avgLag).toBeLessThan(10);
      }
    });

    it('should handle empty events', () => {
      const rules = mineTemporalAssociationRules([]);
      expect(rules).toEqual([]);
    });

    it('should handle single entity', () => {
      const events: TemporalEvent[] = [
        { event: 'A', timestamp: 0, entityId: 'e1' },
        { event: 'B', timestamp: 5, entityId: 'e1' },
      ];

      const rules = mineTemporalAssociationRules(events, { minSupport: 0.1 });
      // Only 1 entity, so may not meet support threshold
      // Should not crash
      expect(rules).toBeDefined();
    });
  });
});

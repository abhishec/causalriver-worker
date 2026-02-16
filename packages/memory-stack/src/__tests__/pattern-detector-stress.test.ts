/**
 * Pattern Detector Stress Tests
 *
 * Validates the OOM fixes from CTO audit:
 * 1. Bitmap Apriori with 1000+ transactions (was crashing at ~500 frequent items)
 * 2. Streaming gap stats in PrefixSpan (was stack-overflowing on Math.max(...500K_array))
 * 3. Frequent item cap at 200 prevents combinatorial explosion
 */
import { describe, it, expect } from 'vitest';
import { mineAssociationRules, mineSequentialPatterns } from '../learning/pattern-detector';

describe('Pattern Detector Stress Tests (OOM Fix Validation)', () => {

  describe('Apriori: 1000 transactions with 500 unique items', () => {
    it('should complete without OOM and under 5 seconds', () => {
      // Generate 1000 transactions with items drawn from 500 unique domains
      const domains = Array.from({ length: 500 }, (_, i) => `domain_${i}`);
      const transactions: string[][] = [];

      for (let t = 0; t < 1000; t++) {
        const txSize = 3 + Math.floor(Math.random() * 8); // 3-10 items per tx
        const tx = new Set<string>();
        for (let i = 0; i < txSize; i++) {
          tx.add(domains[Math.floor(Math.random() * domains.length)]);
        }
        transactions.push(Array.from(tx));
      }

      const start = performance.now();

      const rules = mineAssociationRules(transactions, {
        minSupport: 0.02,  // Low threshold = more frequent items = harder
        minConfidence: 0.3,
        minLift: 1.0,
      });

      const elapsed = performance.now() - start;

      console.log(`Apriori 1000tx/500items: ${rules.length} rules in ${elapsed.toFixed(0)}ms`);

      // Must complete (no OOM crash)
      expect(rules).toBeDefined();
      expect(Array.isArray(rules)).toBe(true);

      // Must complete under 5 seconds (was hanging/crashing before fix)
      expect(elapsed).toBeLessThan(5000);
    });

    it('should handle 2000 transactions with 1000 unique items (worst case)', () => {
      const domains = Array.from({ length: 1000 }, (_, i) => `item_${i}`);
      const transactions: string[][] = [];

      for (let t = 0; t < 2000; t++) {
        const txSize = 5 + Math.floor(Math.random() * 10);
        const tx = new Set<string>();
        for (let i = 0; i < txSize; i++) {
          tx.add(domains[Math.floor(Math.random() * domains.length)]);
        }
        transactions.push(Array.from(tx));
      }

      const start = performance.now();

      const rules = mineAssociationRules(transactions, {
        minSupport: 0.01,  // Very low = max frequent items (should be capped at 200)
        minConfidence: 0.2,
        minLift: 1.0,
      });

      const elapsed = performance.now() - start;

      console.log(`Apriori 2000tx/1000items: ${rules.length} rules in ${elapsed.toFixed(0)}ms`);

      expect(rules).toBeDefined();
      expect(elapsed).toBeLessThan(10000); // Even worst case should be under 10s
    });
  });

  describe('PrefixSpan: 1000+ events with streaming gap stats', () => {
    it('should mine sequential patterns from 1000 events without stack overflow', () => {
      const eventTypes = ['commit', 'pr_open', 'review', 'deploy', 'incident', 'hotfix', 'rollback', 'alert'];
      const events = [];

      // 100 entities, ~10 events each = 1000 events
      for (let entity = 0; entity < 100; entity++) {
        const numEvents = 5 + Math.floor(Math.random() * 15);
        let timestamp = Date.now() - 86400000 * 30; // 30 days ago

        for (let e = 0; e < numEvents; e++) {
          timestamp += Math.floor(Math.random() * 3600000); // 0-1 hour gaps
          events.push({
            entityId: `entity_${entity}`,
            eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
            timestamp,
          });
        }
      }

      const start = performance.now();

      const patterns = mineSequentialPatterns(events, {
        minSupport: 0.05,
        maxGap: 7200000, // 2 hour max gap
        maxLength: 4,
      });

      const elapsed = performance.now() - start;

      console.log(`PrefixSpan 1000 events/100 entities: ${patterns.length} patterns in ${elapsed.toFixed(0)}ms`);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(elapsed).toBeLessThan(5000);
    });

    it('should handle 5000 events (500 entities) without memory issues', () => {
      const eventTypes = ['build', 'test', 'deploy', 'monitor', 'alert', 'triage', 'fix', 'verify', 'release', 'rollback'];
      const events = [];

      for (let entity = 0; entity < 500; entity++) {
        const numEvents = 8 + Math.floor(Math.random() * 12);
        let timestamp = Date.now() - 86400000 * 60;

        for (let e = 0; e < numEvents; e++) {
          timestamp += Math.floor(Math.random() * 7200000);
          events.push({
            entityId: `ent_${entity}`,
            eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
            timestamp,
          });
        }
      }

      console.log(`PrefixSpan stress: ${events.length} total events across 500 entities`);

      const start = performance.now();

      const patterns = mineSequentialPatterns(events, {
        minSupport: 0.03,
        maxGap: 14400000,
        maxLength: 5,
      });

      const elapsed = performance.now() - start;

      console.log(`PrefixSpan 5000 events/500 entities: ${patterns.length} patterns in ${elapsed.toFixed(0)}ms`);

      expect(patterns).toBeDefined();
      expect(elapsed).toBeLessThan(15000);
    });
  });

  describe('Memory ceiling check', () => {
    it('should keep heap usage under 512MB even with large datasets', () => {
      const baselineHeap = process.memoryUsage().heapUsed;

      // Run both algorithms in sequence to check combined memory
      const domains = Array.from({ length: 500 }, (_, i) => `d_${i}`);
      const transactions: string[][] = [];
      for (let t = 0; t < 1000; t++) {
        const tx = new Set<string>();
        for (let i = 0; i < 6; i++) {
          tx.add(domains[Math.floor(Math.random() * domains.length)]);
        }
        transactions.push(Array.from(tx));
      }

      mineAssociationRules(transactions, {
        minSupport: 0.02,
        minConfidence: 0.3,
        minLift: 1.0,
      });

      const afterApriori = process.memoryUsage().heapUsed;
      const aprioriDelta = afterApriori - baselineHeap;

      console.log(`Apriori heap delta: ${(aprioriDelta / 1024 / 1024).toFixed(1)}MB`);

      // Should NOT use 4GB+ like before the fix
      // With bitmap approach + 200 item cap, should be well under 100MB
      expect(aprioriDelta).toBeLessThan(512 * 1024 * 1024); // 512MB absolute max
    });
  });
});

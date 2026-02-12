import { describe, it, expect } from 'vitest';
import { createExpertiseGraph, type ExpertiseInput } from '../core/expertise-graph';

describe('ExpertiseGraph', () => {
  function makeGraph() {
    return createExpertiseGraph({ minEvidence: 1 });
  }

  describe('recordExpertise', () => {
    it('should create a new edge for first expertise signal', () => {
      const graph = makeGraph();
      graph.recordExpertise({
        contributorId: 'user-1',
        contributorName: 'Alice',
        topic: 'src/auth/',
        evidenceType: 'code_change',
      });
      expect(graph.getStats().totalEdges).toBe(1);
      expect(graph.getStats().uniqueContributors).toBe(1);
    });

    it('should increment evidence count on repeat signals', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'user-1', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'user-1', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'user-1', topic: 'react', evidenceType: 'code_change' });

      const edges = graph.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].evidenceCount).toBe(3);
      expect(edges[0].strength).toBeGreaterThan(0.15); // More than single event
    });

    it('should create separate edges for different evidence types', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'user-1', topic: 'auth', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'user-1', topic: 'auth', evidenceType: 'review' });
      expect(graph.getStats().totalEdges).toBe(2);
    });

    it('should normalize topics', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'user-1', topic: 'SRC/Auth/', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'user-1', topic: 'src/auth', evidenceType: 'code_change' });
      // Should be deduplicated (normalized topic)
      expect(graph.getStats().totalEdges).toBe(1);
      expect(graph.getEdges()[0].evidenceCount).toBe(2);
    });

    it('should cap strength at maxStrength', () => {
      const graph = createExpertiseGraph({ minEvidence: 1, maxStrength: 0.99 });
      for (let i = 0; i < 100; i++) {
        graph.recordExpertise({ contributorId: 'user-1', topic: 'react', evidenceType: 'code_change' });
      }
      expect(graph.getEdges()[0].strength).toBeLessThanOrEqual(0.99);
    });
  });

  describe('recordBatch', () => {
    it('should process multiple inputs', () => {
      const graph = makeGraph();
      graph.recordBatch([
        { contributorId: 'user-1', topic: 'react', evidenceType: 'code_change' },
        { contributorId: 'user-2', topic: 'postgres', evidenceType: 'discussion' },
        { contributorId: 'user-1', topic: 'auth', evidenceType: 'review' },
      ]);
      expect(graph.getStats().totalEdges).toBe(3);
      expect(graph.getStats().uniqueContributors).toBe(2);
    });
  });

  describe('queryExperts', () => {
    it('should find experts for a topic', () => {
      const graph = makeGraph();
      // Alice: lots of auth expertise
      for (let i = 0; i < 5; i++) {
        graph.recordExpertise({ contributorId: 'alice', contributorName: 'Alice', topic: 'src/auth', evidenceType: 'code_change' });
      }
      // Bob: some auth expertise
      for (let i = 0; i < 2; i++) {
        graph.recordExpertise({ contributorId: 'bob', contributorName: 'Bob', topic: 'src/auth', evidenceType: 'review' });
      }

      const experts = graph.queryExperts({ topic: 'auth' });
      expect(experts.length).toBe(2);
      expect(experts[0].contributorId).toBe('alice'); // Higher strength
    });

    it('should use fuzzy topic matching', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'src/auth/oauth', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'alice', topic: 'src/auth/oauth', evidenceType: 'code_change' });

      const experts = graph.queryExperts({ topic: 'auth' });
      expect(experts.length).toBe(1);
    });

    it('should respect minStrength', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'react', evidenceType: 'discussion' }); // Low strength (0.05)

      const experts = graph.queryExperts({ topic: 'react', minStrength: 0.5 });
      expect(experts.length).toBe(0);
    });

    it('should respect limit', () => {
      const graph = makeGraph();
      for (let i = 0; i < 10; i++) {
        graph.recordExpertise({ contributorId: `user-${i}`, topic: 'react', evidenceType: 'code_change' });
      }
      const experts = graph.queryExperts({ topic: 'react', limit: 3 });
      expect(experts.length).toBe(3);
    });

    it('should filter by evidence type', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'auth', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'bob', topic: 'auth', evidenceType: 'discussion' });

      const codeExperts = graph.queryExperts({ topic: 'auth', evidenceTypes: ['code_change'] });
      expect(codeExperts.length).toBe(1);
      expect(codeExperts[0].contributorId).toBe('alice');
    });
  });

  describe('getContributorExpertise', () => {
    it('should return all expertise for a contributor', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'alice', topic: 'postgres', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'alice', topic: 'auth', evidenceType: 'review' });

      const expertise = graph.getContributorExpertise('alice');
      expect(expertise.length).toBe(3);
    });

    it('should sort by strength descending', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'auth', evidenceType: 'discussion' }); // 0.05
      graph.recordExpertise({ contributorId: 'alice', topic: 'react', evidenceType: 'code_change' }); // 0.15

      const expertise = graph.getContributorExpertise('alice');
      expect(expertise[0].topic).toBe('react'); // Higher strength first
    });
  });

  describe('getHeatmap', () => {
    it('should return topic → top contributors map', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'bob', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'alice', topic: 'postgres', evidenceType: 'code_change' });

      const heatmap = graph.getHeatmap();
      expect(heatmap.has('react')).toBe(true);
      expect(heatmap.get('react')!.length).toBe(2);
      expect(heatmap.has('postgres')).toBe(true);
    });

    it('should respect topN parameter', () => {
      const graph = makeGraph();
      for (let i = 0; i < 10; i++) {
        graph.recordExpertise({ contributorId: `user-${i}`, topic: 'react', evidenceType: 'code_change' });
      }
      const heatmap = graph.getHeatmap(2);
      expect(heatmap.get('react')!.length).toBe(2);
    });
  });

  describe('applyDecay', () => {
    it('should decay strength based on time since last activity', () => {
      const graph = makeGraph();
      const pastDate = new Date('2024-01-01');
      graph.recordExpertise({
        contributorId: 'alice',
        topic: 'react',
        evidenceType: 'code_change',
        timestamp: pastDate,
      });

      const strengthBefore = graph.getEdges()[0].strength;

      // Decay with reference date 90 days later
      const futureDate = new Date('2024-04-01');
      graph.applyDecay(futureDate);

      const strengthAfter = graph.getEdges()[0].strength;
      expect(strengthAfter).toBeLessThan(strengthBefore);
    });

    it('should remove edges that decay below threshold', () => {
      const graph = createExpertiseGraph({ minEvidence: 1, decayFactor: 0.1 }); // Aggressive decay
      graph.recordExpertise({
        contributorId: 'alice',
        topic: 'react',
        evidenceType: 'discussion', // Low initial strength
        timestamp: new Date('2020-01-01'),
      });

      graph.applyDecay(new Date('2025-01-01')); // 5 years later
      expect(graph.getStats().totalEdges).toBe(0); // Fully decayed
    });

    it('should not decay recent edges', () => {
      const graph = makeGraph();
      const now = new Date();
      graph.recordExpertise({
        contributorId: 'alice',
        topic: 'react',
        evidenceType: 'code_change',
        timestamp: now,
      });

      const strengthBefore = graph.getEdges()[0].strength;
      graph.applyDecay(now);
      const strengthAfter = graph.getEdges()[0].strength;
      expect(strengthAfter).toBe(strengthBefore);
    });
  });

  describe('stats', () => {
    it('should track unique contributors and topics', () => {
      const graph = makeGraph();
      graph.recordExpertise({ contributorId: 'alice', topic: 'react', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'alice', topic: 'postgres', evidenceType: 'code_change' });
      graph.recordExpertise({ contributorId: 'bob', topic: 'react', evidenceType: 'review' });

      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(3);
      expect(stats.uniqueContributors).toBe(2);
      expect(stats.uniqueTopics).toBe(2);
    });
  });
});

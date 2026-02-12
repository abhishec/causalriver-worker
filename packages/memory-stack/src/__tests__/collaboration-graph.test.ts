/**
 * Tests for Collaboration Graph
 *
 * Validates cross-team interaction tracking, team-level aggregation,
 * bridge contributor detection, and network statistics.
 */
import { describe, it, expect } from 'vitest';
import {
  createCollaborationGraph,
  type CollaborationInput,
} from '../core/collaboration-graph';

function makeGraph(config?: Parameters<typeof createCollaborationGraph>[0]) {
  return createCollaborationGraph(config);
}

describe('CollaborationGraph', () => {
  describe('recordInteraction', () => {
    it('should record a collaboration edge between two contributors', () => {
      const g = makeGraph();
      g.recordInteraction({
        contributorA: 'alice',
        contributorB: 'bob',
        interactionType: 'code_review',
      });
      expect(g.getEdges()).toHaveLength(1);
      expect(g.getEdges()[0].count).toBe(1);
      expect(g.getEdges()[0].interactionType).toBe('code_review');
    });

    it('should skip self-interactions', () => {
      const g = makeGraph();
      g.recordInteraction({
        contributorA: 'alice',
        contributorB: 'alice',
        interactionType: 'code_review',
      });
      expect(g.getEdges()).toHaveLength(0);
    });

    it('should increment count for repeated interactions', () => {
      const g = makeGraph();
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' });
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' });
      g.recordInteraction({ contributorA: 'bob', contributorB: 'alice', interactionType: 'code_review' });
      expect(g.getEdges()).toHaveLength(1); // Bidirectional — same edge
      expect(g.getEdges()[0].count).toBe(3);
    });

    it('should treat different interaction types as separate edges', () => {
      const g = makeGraph();
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' });
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'thread_reply' });
      expect(g.getEdges()).toHaveLength(2);
    });

    it('should track contexts (repos, channels, services)', () => {
      const g = makeGraph();
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', context: 'repo:nexusbrain' });
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', context: 'repo:frontend' });
      expect(g.getEdges()[0].contexts).toContain('repo:nexusbrain');
      expect(g.getEdges()[0].contexts).toContain('repo:frontend');
    });

    it('should increase weight with interactions, capped at maxWeight', () => {
      const g = makeGraph({ weightPerInteraction: 0.3 });
      for (let i = 0; i < 20; i++) {
        g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' });
      }
      expect(g.getEdges()[0].weight).toBeLessThanOrEqual(0.99);
    });

    it('should track team assignments', () => {
      const g = makeGraph();
      g.recordInteraction({
        contributorA: 'alice', contributorB: 'bob',
        interactionType: 'code_review',
        teamA: 'platform', teamB: 'frontend',
      });
      const edge = g.getEdges()[0];
      // alice < bob alphabetically, so teamA = platform (alice's), teamB = frontend (bob's)
      expect(edge.teamA).toBe('platform');
      expect(edge.teamB).toBe('frontend');
    });
  });

  describe('recordBatch', () => {
    it('should process batch of interactions', () => {
      const g = makeGraph();
      const batch: CollaborationInput[] = [
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'thread_reply' },
        { contributorA: 'bob', contributorB: 'charlie', interactionType: 'incident_collab' },
      ];
      g.recordBatch(batch);
      expect(g.getEdges()).toHaveLength(3);
    });
  });

  describe('getCollaborators', () => {
    it('should find collaborators for a specific person', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'code_review' },
        { contributorA: 'bob', contributorB: 'charlie', interactionType: 'code_review' },
      ]);
      const collabs = g.getCollaborators({ contributor: 'alice' });
      expect(collabs).toHaveLength(2);
    });

    it('should filter by team', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'code_review', teamA: 'platform', teamB: 'backend' },
        { contributorA: 'dave', contributorB: 'eve', interactionType: 'code_review', teamA: 'data', teamB: 'ml' },
      ]);
      const collabs = g.getCollaborators({ team: 'platform' });
      expect(collabs).toHaveLength(2);
    });

    it('should filter by interaction type', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' },
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'thread_reply' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'incident_collab' },
      ]);
      const reviews = g.getCollaborators({ interactionTypes: ['code_review'] });
      expect(reviews).toHaveLength(1);
    });

    it('should respect limit', () => {
      const g = makeGraph();
      for (let i = 0; i < 20; i++) {
        g.recordInteraction({ contributorA: 'alice', contributorB: `user${i}`, interactionType: 'code_review' });
      }
      const collabs = g.getCollaborators({ contributor: 'alice', limit: 5 });
      expect(collabs).toHaveLength(5);
    });
  });

  describe('getTeamSummary', () => {
    it('should aggregate collaboration by team pairs', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'thread_reply', teamA: 'platform', teamB: 'frontend' },
        { contributorA: 'dave', contributorB: 'eve', interactionType: 'code_review', teamA: 'data', teamB: 'ml' },
      ]);
      const summary = g.getTeamSummary();
      expect(summary).toHaveLength(2);
      const platformFrontend = summary.find(
        s => (s.teamA === 'frontend' && s.teamB === 'platform') || (s.teamA === 'platform' && s.teamB === 'frontend')
      );
      expect(platformFrontend).toBeDefined();
      expect(platformFrontend!.totalInteractions).toBe(2);
      expect(platformFrontend!.uniqueContributorPairs).toBe(2);
    });

    it('should skip edges without team tags', () => {
      const g = makeGraph();
      g.recordInteraction({ contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review' });
      const summary = g.getTeamSummary();
      expect(summary).toHaveLength(0);
    });
  });

  describe('getNetworkStats', () => {
    it('should compute network statistics', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'code_review', teamA: 'platform', teamB: 'backend' },
        { contributorA: 'bob', contributorB: 'charlie', interactionType: 'code_review', teamA: 'frontend', teamB: 'backend' },
      ]);
      const stats = g.getNetworkStats();
      expect(stats.uniqueContributors).toBe(3);
      expect(stats.uniqueTeams).toBe(3);
      expect(stats.totalEdges).toBe(3);
      expect(stats.crossTeamEdges).toBe(3);
      // 3 contributors, max edges = 3*2/2 = 3, density = 3/3 = 1
      expect(stats.density).toBeCloseTo(1.0, 1);
    });

    it('should handle empty graph', () => {
      const g = makeGraph();
      const stats = g.getNetworkStats();
      expect(stats.totalEdges).toBe(0);
      expect(stats.uniqueContributors).toBe(0);
    });
  });

  describe('getCrossTeamEdges', () => {
    it('should return only cross-team edges', () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'platform' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend' },
      ]);
      const cross = g.getCrossTeamEdges();
      expect(cross).toHaveLength(1);
      expect(cross[0].contributorB === 'charlie' || cross[0].contributorA === 'charlie').toBe(true);
    });
  });

  describe('getBridgeContributors', () => {
    it('should find contributors bridging multiple teams', () => {
      const g = makeGraph();
      // Alice bridges platform↔frontend and platform↔backend
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'code_review', teamA: 'platform', teamB: 'backend' },
        { contributorA: 'alice', contributorB: 'dave', interactionType: 'code_review', teamA: 'platform', teamB: 'data' },
        // Bob only connects frontend↔platform
        { contributorA: 'bob', contributorB: 'eve', interactionType: 'code_review', teamA: 'frontend', teamB: 'frontend' },
      ]);
      const bridges = g.getBridgeContributors(3);
      expect(bridges.length).toBeGreaterThan(0);
      expect(bridges[0].contributor).toBe('alice');
      expect(bridges[0].teams.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('applyDecay', () => {
    it('should decay weights based on time since last interaction', () => {
      const g = makeGraph({ decayFactor: 0.5 }); // Aggressive decay for testing
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      g.recordInteraction({
        contributorA: 'alice', contributorB: 'bob',
        interactionType: 'code_review',
        timestamp: oldDate,
      });
      const beforeDecay = g.getEdges()[0].weight;
      g.applyDecay();
      expect(g.getEdges()[0].weight).toBeLessThan(beforeDecay);
    });

    it('should remove edges decayed below threshold', () => {
      const g = makeGraph({ decayFactor: 0.01, weightPerInteraction: 0.02 });
      const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      g.recordInteraction({
        contributorA: 'alice', contributorB: 'bob',
        interactionType: 'code_review',
        timestamp: veryOld,
      });
      g.applyDecay();
      expect(g.getEdges()).toHaveLength(0);
    });

    it('should not decay recent interactions', () => {
      const g = makeGraph();
      g.recordInteraction({
        contributorA: 'alice', contributorB: 'bob',
        interactionType: 'code_review',
        timestamp: new Date(), // Now
      });
      const before = g.getEdges()[0].weight;
      g.applyDecay();
      expect(g.getEdges()[0].weight).toBe(before);
    });
  });

  describe('persistence', () => {
    it('should persist and load to/from supabase mock', async () => {
      const g = makeGraph();
      g.recordBatch([
        { contributorA: 'alice', contributorB: 'bob', interactionType: 'code_review', teamA: 'platform', teamB: 'frontend', context: 'repo:nexus' },
        { contributorA: 'alice', contributorB: 'charlie', interactionType: 'thread_reply', teamA: 'platform', teamB: 'backend' },
      ]);

      // Mock persist
      const upsertedRows: any[] = [];
      const mockSupabase = {
        from: () => ({
          upsert: (rows: any[]) => {
            upsertedRows.push(...rows);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  data: upsertedRows.map(r => ({
                    signal_value: r.signal_value,
                    metadata: r.metadata,
                    entity_id: r.entity_id,
                  })),
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      await g.persist(mockSupabase, 'org-1');
      expect(upsertedRows).toHaveLength(2);

      // Load into fresh graph
      const g2 = makeGraph();
      await g2.load(mockSupabase, 'org-1');
      expect(g2.getEdges()).toHaveLength(2);
    });
  });
});

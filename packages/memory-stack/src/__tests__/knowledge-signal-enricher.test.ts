/**
 * Knowledge-Aware Signal Enricher Tests
 *
 * Tests the dependency-graph-powered signal enrichment that adds impact
 * analysis, risk scoring, and business rule context to any connector signal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enrichSignalWithKnowledgeGraph,
  enrichSignalsWithKnowledgeGraph,
  extractEntityIds,
  matchBusinessRules,
  type EnrichableSignal,
} from '../core/nlp/knowledge-signal-enricher';
import { createKnowledgeDependencyGraph, type KnowledgeDependencyGraphInstance } from '../core/knowledge-dependency-graph';

describe('Knowledge Signal Enricher', () => {
  let graph: KnowledgeDependencyGraphInstance;

  beforeEach(() => {
    graph = createKnowledgeDependencyGraph({ weightPerEdge: 0.10 });

    // Build a realistic code dependency graph
    graph.recordBatch([
      // auth module — high fanout hub
      { sourceId: 'src/api/routes.ts', targetId: 'src/auth/session.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      { sourceId: 'src/billing/checkout.ts', targetId: 'src/auth/session.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      { sourceId: 'src/dashboard/profile.ts', targetId: 'src/auth/session.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      { sourceId: 'src/auth/session.ts', targetId: 'src/core/crypto.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      { sourceId: 'src/auth/session.ts', targetId: 'src/core/db.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      // billing chain
      { sourceId: 'src/billing/checkout.ts', targetId: 'src/billing/stripe.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      // financial model
      { sourceId: 'MRR', targetId: 'ARR', dependencyType: 'feeds', knowledgeDomain: 'finance' },
      { sourceId: 'ARR', targetId: 'Revenue_Growth', dependencyType: 'feeds', knowledgeDomain: 'finance' },
    ]);
  });

  // ── extractEntityIds ─────────────────────────────────────

  describe('extractEntityIds', () => {
    it('extracts string entity IDs from metadata', () => {
      const signal: EnrichableSignal = {
        metadata: { file_path: 'src/auth/session.ts' },
      };
      const ids = extractEntityIds(signal, ['file_path']);
      expect(ids).toEqual(['src/auth/session.ts']);
    });

    it('extracts array of entity IDs', () => {
      const signal: EnrichableSignal = {
        metadata: {
          file_paths: ['src/auth/session.ts', 'src/billing/checkout.ts'],
        },
      };
      const ids = extractEntityIds(signal, ['file_paths']);
      expect(ids).toHaveLength(2);
    });

    it('deduplicates entity IDs', () => {
      const signal: EnrichableSignal = {
        metadata: {
          file_paths: ['src/auth.ts', 'src/auth.ts', 'src/billing.ts'],
        },
      };
      const ids = extractEntityIds(signal, ['file_paths']);
      expect(ids).toHaveLength(2);
    });

    it('returns empty array when no matching fields', () => {
      const signal: EnrichableSignal = { metadata: { count: 5 } };
      expect(extractEntityIds(signal, ['file_path'])).toEqual([]);
    });

    it('handles missing metadata', () => {
      const signal: EnrichableSignal = {};
      expect(extractEntityIds(signal, ['file_path'])).toEqual([]);
    });
  });

  // ── matchBusinessRules ───────────────────────────────────

  describe('matchBusinessRules', () => {
    it('matches auth-related entities to security rules', () => {
      const rules = matchBusinessRules(['src/auth/session.ts']);
      expect(rules).toContain('Authentication & access control');
    });

    it('matches billing entities to finance rules', () => {
      const rules = matchBusinessRules(['src/billing/checkout.ts']);
      expect(rules).toContain('Payment processing & billing');
      expect(rules).toContain('E-commerce & checkout flow');
    });

    it('returns empty for unmatched entities', () => {
      const rules = matchBusinessRules(['src/utils/helpers.ts']);
      expect(rules).toEqual([]);
    });

    it('matches multiple domains', () => {
      const rules = matchBusinessRules(['src/auth/login.ts', 'src/payment/stripe.ts']);
      expect(rules.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── enrichSignalWithKnowledgeGraph ───────────────────────

  describe('enrichSignalWithKnowledgeGraph', () => {
    it('enriches signal with dependency context for known entity', () => {
      const signal: EnrichableSignal = {
        metadata: { file_path: 'src/auth/session.ts' },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      expect(signal.metadata!.knowledge_affected_entities).toBeDefined();
      expect(signal.metadata!.knowledge_impact_radius).toBeGreaterThan(0);
      expect(signal.metadata!.knowledge_risk_score).toBeGreaterThan(0);
      expect(signal.metadata!.knowledge_affected_domains).toBeDefined();
      expect(signal.metadata!.knowledge_business_rules).toBeDefined();
    });

    it('includes downstream dependents', () => {
      const signal: EnrichableSignal = {
        metadata: { file_path: 'src/auth/session.ts' },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      const downstream = signal.metadata!.knowledge_downstream_dependents as string[];
      expect(downstream.length).toBeGreaterThan(0);
    });

    it('computes complexity metrics', () => {
      const signal: EnrichableSignal = {
        metadata: { file_path: 'src/auth/session.ts' },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      const complexity = signal.metadata!.knowledge_complexity as any;
      expect(complexity.avgFanOut).toBeGreaterThanOrEqual(0);
      expect(typeof complexity.maxInstability).toBe('number');
      expect(typeof complexity.hasCyclicDeps).toBe('boolean');
    });

    it('skips enrichment for unknown entities', () => {
      const signal: EnrichableSignal = {
        metadata: { file_path: 'src/unknown/random.ts' },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      // Should not have knowledge enrichment since entity is not in graph
      expect(signal.metadata!.knowledge_impact_radius).toBeUndefined();
    });

    it('handles PR signal with multiple file paths', () => {
      const signal: EnrichableSignal = {
        metadata: {
          file_paths: ['src/auth/session.ts', 'src/billing/checkout.ts'],
          author: 'alice',
        },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_paths'],
      });

      expect(signal.metadata!.knowledge_affected_entities).toBeDefined();
      const entities = signal.metadata!.knowledge_affected_entities as string[];
      expect(entities).toHaveLength(2);
      // Impact should be aggregated from both entities
      expect((signal.metadata!.knowledge_impact_radius as number)).toBeGreaterThan(0);
    });

    it('preserves existing metadata fields', () => {
      const signal: EnrichableSignal = {
        metadata: {
          file_path: 'src/auth/session.ts',
          author: 'alice',
          priority: 'high',
        },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      expect(signal.metadata!.author).toBe('alice');
      expect(signal.metadata!.priority).toBe('high');
    });

    it('enriches financial model signals', () => {
      const signal: EnrichableSignal = {
        metadata: { line_item: 'MRR' },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['line_item'],
      });

      expect(signal.metadata!.knowledge_impact_radius).toBeGreaterThanOrEqual(2);
      const domains = signal.metadata!.knowledge_affected_domains as string[];
      expect(domains).toContain('finance');
    });

    it('handles empty metadata gracefully', () => {
      const signal: EnrichableSignal = {};
      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });
      // Should not crash, should not add enrichment
      expect(signal.metadata?.knowledge_risk_score).toBeUndefined();
    });
  });

  // ── enrichSignalsWithKnowledgeGraph (batch) ──────────────

  describe('enrichSignalsWithKnowledgeGraph', () => {
    it('enriches multiple signals in batch', () => {
      const signals: EnrichableSignal[] = [
        { metadata: { file_path: 'src/auth/session.ts' } },
        { metadata: { file_path: 'src/billing/checkout.ts' } },
        { metadata: { file_path: 'src/unknown/noop.ts' } },
      ];

      enrichSignalsWithKnowledgeGraph(signals, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      // First two should be enriched (known entities)
      expect(signals[0].metadata!.knowledge_risk_score).toBeDefined();
      expect(signals[1].metadata!.knowledge_risk_score).toBeDefined();
    });

    it('handles empty signal array', () => {
      const result = enrichSignalsWithKnowledgeGraph([], {
        dependencyGraph: graph,
      });
      expect(result).toEqual([]);
    });
  });

  // ── Cross-domain enrichment scenarios ────────────────────

  describe('Cross-domain enrichment', () => {
    it('identifies business rules for auth + billing PR', () => {
      const signal: EnrichableSignal = {
        metadata: {
          file_paths: ['src/auth/session.ts', 'src/billing/stripe.ts'],
        },
      };

      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: graph,
        entityIdFields: ['file_paths'],
      });

      const rules = signal.metadata!.knowledge_business_rules as string[];
      expect(rules).toContain('Authentication & access control');
      expect(rules).toContain('Payment processing & billing');
    });
  });
});

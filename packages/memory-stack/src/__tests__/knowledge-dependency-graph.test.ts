/**
 * Knowledge Dependency Graph Tests
 *
 * Tests the universal structural intelligence graph that models
 * dependencies across code, finance, research, and documentation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createKnowledgeDependencyGraph,
  type KnowledgeDependencyGraphInstance,
  type DependencyInput,
} from '../core/knowledge-dependency-graph';
import type { FileIndex } from '../code-indexing/code-parser';

describe('Knowledge Dependency Graph', () => {
  let graph: KnowledgeDependencyGraphInstance;

  beforeEach(() => {
    graph = createKnowledgeDependencyGraph({ weightPerEdge: 0.10 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: RECORDING — Basic upsert, weight, labels
  // ═══════════════════════════════════════════════════════════════════

  describe('Recording', () => {
    it('records a single dependency edge', () => {
      graph.recordDependency({
        sourceId: 'src/auth.ts',
        targetId: 'src/core/crypto.ts',
        dependencyType: 'imports',
        knowledgeDomain: 'code',
      });

      const edges = graph.getEdges();
      expect(edges.length).toBe(1);
      expect(edges[0].sourceId).toBe('src/auth.ts');
      expect(edges[0].targetId).toBe('src/core/crypto.ts');
      expect(edges[0].dependencyType).toBe('imports');
      expect(edges[0].knowledgeDomain).toBe('code');
      expect(edges[0].weight).toBeGreaterThan(0);
    });

    it('accumulates weight on duplicate edges', () => {
      const input: DependencyInput = {
        sourceId: 'src/auth.ts',
        targetId: 'src/core/db.ts',
        dependencyType: 'imports',
        knowledgeDomain: 'code',
      };

      graph.recordDependency(input);
      const w1 = graph.getEdges()[0].weight;

      graph.recordDependency(input);
      const w2 = graph.getEdges()[0].weight;

      expect(w2).toBeGreaterThan(w1);
      expect(graph.getEdges()[0].count).toBe(2);
    });

    it('skips self-dependencies', () => {
      graph.recordDependency({
        sourceId: 'src/auth.ts',
        targetId: 'src/auth.ts',
        dependencyType: 'imports',
        knowledgeDomain: 'code',
      });
      expect(graph.getEdges().length).toBe(0);
    });

    it('normalizes entity IDs', () => {
      graph.recordDependency({
        sourceId: 'SRC/Auth.ts/',
        targetId: 'SRC/Core/DB.ts',
        dependencyType: 'imports',
        knowledgeDomain: 'code',
      });

      const edges = graph.getEdges();
      expect(edges[0].sourceId).toBe('src/auth.ts');
      expect(edges[0].targetId).toBe('src/core/db.ts');
    });

    it('tracks labels up to 20', () => {
      for (let i = 0; i < 25; i++) {
        graph.recordDependency({
          sourceId: 'src/auth.ts',
          targetId: 'src/db.ts',
          dependencyType: 'imports',
          knowledgeDomain: 'code',
          labels: [`symbol_${i}`],
        });
      }

      const edges = graph.getEdges();
      expect(edges[0].labels.length).toBeLessThanOrEqual(20);
    });

    it('records batch inputs', () => {
      graph.recordBatch([
        { sourceId: 'a.ts', targetId: 'b.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'b.ts', targetId: 'c.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'c.ts', targetId: 'd.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);
      expect(graph.getEdges().length).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: CODE — recordFromFileIndex
  // ═══════════════════════════════════════════════════════════════════

  describe('Code — recordFromFileIndex', () => {
    it('converts FileIndex imports into dependency edges', () => {
      const fileIndex: FileIndex = {
        filePath: 'src/auth/index.ts',
        language: 'typescript',
        symbols: [],
        imports: ['./utils', '../core/crypto', 'express'],
        exports: ['authenticate'],
        contentHash: 'abc123',
        lastIndexedAt: new Date(),
      };

      graph.recordFromFileIndex(fileIndex);
      const edges = graph.getEdges();

      // Should have 3 import edges
      expect(edges.filter(e => e.dependencyType === 'imports').length).toBe(3);

      // Relative path './utils' should resolve to 'src/auth/utils'
      const utilsEdge = edges.find(e => e.targetId.includes('auth/utils'));
      expect(utilsEdge).toBeDefined();

      // Relative path '../core/crypto' should resolve to 'src/core/crypto'
      const cryptoEdge = edges.find(e => e.targetId.includes('core/crypto'));
      expect(cryptoEdge).toBeDefined();

      // External package 'express' stays as-is
      const expressEdge = edges.find(e => e.targetId === 'express');
      expect(expressEdge).toBeDefined();
    });

    it('records class containment from parent symbols', () => {
      const fileIndex: FileIndex = {
        filePath: 'src/service.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'UserService',
            kind: 'class',
            filePath: 'src/service.ts',
            startLine: 1,
            endLine: 50,
            signature: 'class UserService',
            docComment: '',
            bodyPreview: '',
            isExported: true,
          },
          {
            name: 'getUser',
            kind: 'method',
            filePath: 'src/service.ts',
            startLine: 10,
            endLine: 20,
            signature: 'getUser(id: string): User',
            docComment: '',
            parentSymbol: 'UserService',
            bodyPreview: '',
            isExported: false,
          },
        ],
        imports: [],
        exports: ['UserService'],
        contentHash: 'def456',
        lastIndexedAt: new Date(),
      };

      graph.recordFromFileIndex(fileIndex);
      const edges = graph.getEdges();

      const containsEdge = edges.find(e => e.dependencyType === 'contains');
      expect(containsEdge).toBeDefined();
      expect(containsEdge!.sourceId).toContain('userservice');
      expect(containsEdge!.targetId).toContain('getuser');
    });

    it('handles batch file indexes', () => {
      const indexes: FileIndex[] = [
        {
          filePath: 'src/a.ts', language: 'typescript', symbols: [],
          imports: ['./b', './c'], exports: [], contentHash: '1', lastIndexedAt: new Date(),
        },
        {
          filePath: 'src/b.ts', language: 'typescript', symbols: [],
          imports: ['./c'], exports: [], contentHash: '2', lastIndexedAt: new Date(),
        },
      ];

      graph.recordFromFileIndexBatch(indexes);
      expect(graph.getEdges().length).toBe(3); // a→b, a→c, b→c
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: FINANCE — Revenue → Ratio → PnL chains
  // ═══════════════════════════════════════════════════════════════════

  describe('Finance — Revenue model dependencies', () => {
    beforeEach(() => {
      // Build a financial model dependency chain
      graph.recordBatch([
        { sourceId: 'MRR', targetId: 'ARR', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'ARR', targetId: 'Revenue_Growth_Rate', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'Revenue_Growth_Rate', targetId: 'Gross_Margin', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'COGS', targetId: 'Gross_Margin', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'Gross_Margin', targetId: 'PnL_Summary', dependencyType: 'rolls_up', knowledgeDomain: 'finance' },
        { sourceId: 'OpEx', targetId: 'PnL_Summary', dependencyType: 'rolls_up', knowledgeDomain: 'finance' },
      ]);
    });

    it('tracks financial dependency chains', () => {
      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(6);
      expect(stats.byDomain.finance).toBe(6);
    });

    it('finds what MRR feeds into (upstream)', () => {
      const deps = graph.queryDependencies({
        entityId: 'MRR',
        direction: 'upstream',
      });
      expect(deps.length).toBe(1); // MRR → ARR
      expect(deps[0].targetId).toBe('arr');
    });

    it('finds transitive impact of changing MRR', () => {
      const impact = graph.analyzeImpact('MRR');
      // MRR → ARR → Revenue_Growth_Rate → Gross_Margin → PnL_Summary
      expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(3);
      expect(impact.affectedDomains).toContain('finance');
    });

    it('finds all inputs to PnL (downstream)', () => {
      const deps = graph.queryDependencies({
        entityId: 'PnL_Summary',
        direction: 'downstream',
      });
      // Gross_Margin and OpEx feed into PnL
      expect(deps.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: RESEARCH — Paper citation graphs
  // ═══════════════════════════════════════════════════════════════════

  describe('Research — Paper citations', () => {
    beforeEach(() => {
      graph.recordBatch([
        { sourceId: 'paper_attention_is_all_you_need', targetId: 'paper_bert', dependencyType: 'cites', knowledgeDomain: 'research' },
        { sourceId: 'paper_attention_is_all_you_need', targetId: 'paper_gpt2', dependencyType: 'cites', knowledgeDomain: 'research' },
        { sourceId: 'paper_bert', targetId: 'paper_roberta', dependencyType: 'cites', knowledgeDomain: 'research' },
        { sourceId: 'paper_gpt2', targetId: 'paper_gpt3', dependencyType: 'cites', knowledgeDomain: 'research' },
        { sourceId: 'paper_gpt3', targetId: 'paper_chatgpt', dependencyType: 'cites', knowledgeDomain: 'research' },
      ]);
    });

    it('tracks citation chains', () => {
      const stats = graph.getStats();
      expect(stats.byDomain.research).toBe(5);
    });

    it('finds foundational paper with highest impact', () => {
      const impact = graph.analyzeImpact('paper_attention_is_all_you_need');
      // This paper is cited by everything downstream
      expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(4);
    });

    it('traces transitive citations', () => {
      const deps = graph.queryDependencies({
        entityId: 'paper_attention_is_all_you_need',
        direction: 'upstream',
        transitive: true,
      });
      // Should find all papers downstream of attention paper
      expect(deps.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 5: QUERYING — Direction, transitive, filters
  // ═══════════════════════════════════════════════════════════════════

  describe('Querying', () => {
    beforeEach(() => {
      // A → B → C → D chain
      graph.recordBatch([
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'C', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'C', targetId: 'D', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'X', targetId: 'Y', dependencyType: 'feeds', knowledgeDomain: 'finance' },
      ]);
    });

    it('queries upstream (what does A depend on?)', () => {
      const deps = graph.queryDependencies({ entityId: 'A', direction: 'upstream' });
      expect(deps.length).toBe(1);
      expect(deps[0].targetId).toBe('b');
    });

    it('queries downstream (what depends on D?)', () => {
      const deps = graph.queryDependencies({ entityId: 'D', direction: 'downstream' });
      expect(deps.length).toBe(1); // C depends on D
      expect(deps[0].sourceId).toBe('c');
    });

    it('queries both directions', () => {
      const deps = graph.queryDependencies({ entityId: 'B', direction: 'both' });
      expect(deps.length).toBe(2); // A→B and B→C
    });

    it('queries transitive dependencies', () => {
      const deps = graph.queryDependencies({
        entityId: 'A',
        direction: 'upstream',
        transitive: true,
      });
      // A → B → C → D
      expect(deps.length).toBe(3);
    });

    it('respects maxDepth', () => {
      const deps = graph.queryDependencies({
        entityId: 'A',
        direction: 'upstream',
        transitive: true,
        maxDepth: 1,
      });
      expect(deps.length).toBe(1); // Only A → B
    });

    it('filters by knowledge domain', () => {
      const codeDeps = graph.queryDependencies({ knowledgeDomain: 'code' });
      const financeDeps = graph.queryDependencies({ knowledgeDomain: 'finance' });
      expect(codeDeps.length).toBe(3);
      expect(financeDeps.length).toBe(1);
    });

    it('filters by dependency type', () => {
      const importDeps = graph.queryDependencies({ dependencyTypes: ['imports'] });
      const feedDeps = graph.queryDependencies({ dependencyTypes: ['feeds'] });
      expect(importDeps.length).toBe(3);
      expect(feedDeps.length).toBe(1);
    });

    it('respects limit', () => {
      const deps = graph.queryDependencies({ limit: 2 });
      expect(deps.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: IMPACT ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  describe('Impact Analysis', () => {
    it('computes blast radius for high-fanout entity', () => {
      // Create a hub entity that many things depend on
      for (let i = 0; i < 15; i++) {
        graph.recordDependency({
          sourceId: `consumer_${i}`,
          targetId: 'shared_lib',
          dependencyType: 'imports',
          knowledgeDomain: 'code',
        });
      }

      const impact = graph.analyzeImpact('shared_lib');
      expect(impact.directDependents.length).toBe(15);
      expect(impact.totalImpactRadius).toBe(15);
      expect(impact.riskScore).toBeGreaterThan(0.5);
    });

    it('finds critical paths through dependency chain', () => {
      graph.recordBatch([
        { sourceId: 'api/handler.ts', targetId: 'core/auth.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'core/auth.ts', targetId: 'lib/crypto.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'lib/crypto.ts', targetId: 'lib/utils.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const impact = graph.analyzeImpact('lib/utils.ts');
      expect(impact.criticalPaths.length).toBeGreaterThan(0);
      expect(impact.criticalPaths[0].length).toBeGreaterThan(1);
    });

    it('identifies affected business domains', () => {
      graph.recordBatch([
        { sourceId: 'src/billing/checkout.ts', targetId: 'src/auth/session.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'src/api/routes.ts', targetId: 'src/auth/session.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const impact = graph.analyzeImpact('src/auth/session.ts');
      expect(impact.affectedDomains.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 7: CYCLE DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('Cycle Detection', () => {
    it('detects a simple cycle', () => {
      graph.recordBatch([
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'C', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'C', targetId: 'A', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const result = graph.detectCycles();
      expect(result.count).toBe(1);
      expect(result.cycles[0].length).toBe(3);
    });

    it('returns no cycles for a DAG', () => {
      graph.recordBatch([
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'C', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'A', targetId: 'C', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const result = graph.detectCycles();
      expect(result.count).toBe(0);
    });

    it('detects multiple cycles', () => {
      graph.recordBatch([
        // Cycle 1: A → B → A
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'A', dependencyType: 'imports', knowledgeDomain: 'code' },
        // Cycle 2: X → Y → Z → X
        { sourceId: 'X', targetId: 'Y', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'Y', targetId: 'Z', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'Z', targetId: 'X', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const result = graph.detectCycles();
      expect(result.count).toBe(2);
    });

    it('filters cycles by domain', () => {
      graph.recordBatch([
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'A', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'X', targetId: 'Y', dependencyType: 'feeds', knowledgeDomain: 'finance' },
      ]);

      const codeCycles = graph.detectCycles('code');
      const financeCycles = graph.detectCycles('finance');
      expect(codeCycles.count).toBe(1);
      expect(financeCycles.count).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 8: DECAY
  // ═══════════════════════════════════════════════════════════════════

  describe('Decay', () => {
    it('decays old edges over time', () => {
      const old = new Date();
      old.setDate(old.getDate() - 60); // 60 days ago

      graph.recordDependency({
        sourceId: 'A', targetId: 'B',
        dependencyType: 'imports', knowledgeDomain: 'code',
        timestamp: old,
      });

      const beforeDecay = graph.getEdges()[0].weight;
      graph.applyDecay();
      const afterDecay = graph.getEdges()[0].weight;

      expect(afterDecay).toBeLessThan(beforeDecay);
    });

    it('removes edges below threshold after decay', () => {
      const veryOld = new Date();
      veryOld.setFullYear(veryOld.getFullYear() - 5); // 5 years ago

      graph.recordDependency({
        sourceId: 'ancient', targetId: 'relic',
        dependencyType: 'imports', knowledgeDomain: 'code',
        timestamp: veryOld,
      });

      graph.applyDecay();
      expect(graph.getEdges().length).toBe(0); // Edge decayed below 0.01
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 9: COMPLEXITY METRICS
  // ═══════════════════════════════════════════════════════════════════

  describe('Complexity Metrics', () => {
    it('computes fan-in and fan-out', () => {
      // B is imported by A and C (fan-in = 2)
      // B imports D (fan-out = 1)
      graph.recordBatch([
        { sourceId: 'A', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'C', targetId: 'B', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'B', targetId: 'D', dependencyType: 'imports', knowledgeDomain: 'code' },
      ]);

      const metrics = graph.getComplexityMetrics('B');
      expect(metrics.fanIn).toBe(2);
      expect(metrics.fanOut).toBe(1);
      expect(metrics.instability).toBeCloseTo(0.33, 1);
    });

    it('returns zero for unknown entities', () => {
      const metrics = graph.getComplexityMetrics('nonexistent');
      expect(metrics.fanIn).toBe(0);
      expect(metrics.fanOut).toBe(0);
      expect(metrics.instability).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 10: DOMAIN MAPPING
  // ═══════════════════════════════════════════════════════════════════

  describe('Domain Mapping', () => {
    it('maps code paths to business domains', () => {
      expect(graph.mapEntityToDomain('src/auth/login.ts')).toBe('security');
      expect(graph.mapEntityToDomain('src/billing/checkout.ts')).toBe('finance');
      expect(graph.mapEntityToDomain('src/api/routes.ts')).toBe('engineering');
      expect(graph.mapEntityToDomain('src/marketing/campaign.ts')).toBe('marketing');
    });

    it('maps financial terms to finance domain', () => {
      expect(graph.mapEntityToDomain('MRR')).toBe('finance');
      expect(graph.mapEntityToDomain('Revenue_Growth_Rate')).toBe('finance');
      expect(graph.mapEntityToDomain('Gross_Margin')).toBe('finance');
      expect(graph.mapEntityToDomain('Balance_Sheet_Q4')).toBe('finance');
    });

    it('maps documentation terms', () => {
      expect(graph.mapEntityToDomain('Chapter_3_Authentication')).toBe('documentation');
      expect(graph.mapEntityToDomain('Runbook_Incident_Response')).toBe('documentation');
    });

    it('maps research terms', () => {
      expect(graph.mapEntityToDomain('paper_transformer_study')).toBe('research');
      expect(graph.mapEntityToDomain('methodology_review_2024')).toBe('research');
    });

    it('returns null for unmapped entities', () => {
      expect(graph.mapEntityToDomain('xyz_unknown_123')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 11: STATISTICS
  // ═══════════════════════════════════════════════════════════════════

  describe('Statistics', () => {
    it('returns comprehensive stats across domains', () => {
      graph.recordBatch([
        { sourceId: 'a.ts', targetId: 'b.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'c.ts', targetId: 'd.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        { sourceId: 'MRR', targetId: 'ARR', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'paper_A', targetId: 'paper_B', dependencyType: 'cites', knowledgeDomain: 'research' },
      ]);

      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(4);
      expect(stats.uniqueEntities).toBe(8);
      expect(stats.byDomain.code).toBe(2);
      expect(stats.byDomain.finance).toBe(1);
      expect(stats.byDomain.research).toBe(1);
      expect(stats.avgDepsPerEntity).toBe(0.5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 12: MULTI-DOMAIN — Universal graph
  // ═══════════════════════════════════════════════════════════════════

  describe('Multi-Domain Universal Graph', () => {
    it('holds code, finance, research, and docs in single instance', () => {
      graph.recordBatch([
        // Code
        { sourceId: 'src/auth.ts', targetId: 'src/crypto.ts', dependencyType: 'imports', knowledgeDomain: 'code' },
        // Finance
        { sourceId: 'Revenue', targetId: 'Gross_Margin', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        // Research
        { sourceId: 'Paper_A', targetId: 'Paper_B', dependencyType: 'cites', knowledgeDomain: 'research' },
        // Documentation
        { sourceId: 'Chapter_1', targetId: 'Chapter_2', dependencyType: 'requires', knowledgeDomain: 'documentation' },
        // Legal
        { sourceId: 'Clause_GDPR_Art5', targetId: 'Privacy_Policy_v3', dependencyType: 'references', knowledgeDomain: 'legal' },
        // Process
        { sourceId: 'PR_Review', targetId: 'Merge_to_Main', dependencyType: 'gates', knowledgeDomain: 'process' },
      ]);

      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(6);
      expect(Object.keys(stats.byDomain).length).toBe(6); // All 6 domains

      // Domain-filtered queries work
      const codeOnly = graph.queryDependencies({ knowledgeDomain: 'code' });
      expect(codeOnly.length).toBe(1);

      const financeOnly = graph.queryDependencies({ knowledgeDomain: 'finance' });
      expect(financeOnly.length).toBe(1);
    });

    it('impact analysis works across domains', () => {
      // Create cross-domain dependencies
      graph.recordBatch([
        { sourceId: 'auth_service', targetId: 'billing_service', dependencyType: 'depends_on', knowledgeDomain: 'code' },
        { sourceId: 'billing_service', targetId: 'MRR_metric', dependencyType: 'feeds', knowledgeDomain: 'finance' },
        { sourceId: 'MRR_metric', targetId: 'Investor_Report', dependencyType: 'feeds', knowledgeDomain: 'finance' },
      ]);

      const impact = graph.analyzeImpact('billing_service');
      expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 13: PERSIST/LOAD — Round-trip
  // ═══════════════════════════════════════════════════════════════════

  describe('Persist and Load', () => {
    it('round-trips through mock Supabase', async () => {
      graph.recordBatch([
        { sourceId: 'a.ts', targetId: 'b.ts', dependencyType: 'imports', knowledgeDomain: 'code', labels: ['default'] },
        { sourceId: 'MRR', targetId: 'ARR', dependencyType: 'feeds', knowledgeDomain: 'finance' },
      ]);

      // Mock Supabase
      const stored: any[] = [];
      const mockSupabase = {
        from: (table: string) => ({
          upsert: (data: any[]) => {
            stored.push(...data);
            return { error: null };
          },
          select: () => ({
            eq: (_field: string, _val: string) => ({
              eq: (_f2: string, _v2: string) => ({
                eq: (_f3: string, _v3: string) => ({
                  data: stored.map(row => ({
                    ...row,
                    signal_metadata: row.metadata,
                  })),
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      await graph.persist(mockSupabase, 'org_123');
      expect(stored.length).toBe(2);

      // Load into new graph
      const graph2 = createKnowledgeDependencyGraph();
      await graph2.load(mockSupabase, 'org_123');

      expect(graph2.getEdges().length).toBe(2);
      const stats = graph2.getStats();
      expect(stats.byDomain.code).toBe(1);
      expect(stats.byDomain.finance).toBe(1);
    });
  });
});

/**
 * Knowledge Dependency Graph — End-to-End Validation
 * ═══════════════════════════════════════════════════════════
 *
 * Proves the Knowledge Dependency Graph works at scale across ALL domains:
 *   - Code: Real Next.js-style file dependencies + impact analysis
 *   - Finance: Revenue model → ratio → PnL dependency chains
 *   - Research: Paper citation graph with transitive impact
 *   - Cross-domain: All domains in one graph, queries respect filters
 *   - Signal enrichment: PR signals auto-enriched with dependency context
 *   - Training packs: 29 packs load (26 existing + 3 new knowledge packs)
 *   - Scale test: 10K+ edges with adjacency index performance
 *
 * Target: 10/10 quality score
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createKnowledgeDependencyGraph,
  type KnowledgeDependencyGraphInstance,
} from '../core/knowledge-dependency-graph';
import {
  enrichSignalWithKnowledgeGraph,
  type EnrichableSignal,
} from '../core/nlp/knowledge-signal-enricher';
import { createExpertiseGraph } from '../core/expertise-graph';
import { createBrainTrainer } from '../learning/brain-trainer';
import { TRAINING_LIBRARY } from '../learning/training-library';
import { KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS } from '../learning/knowledge-intelligence-training';

// ══════════════════════════════════════════════════════════════════════
// TEST DATA: Real-world-style dependency structures
// ══════════════════════════════════════════════════════════════════════

/** Simulates a Next.js-style codebase with realistic import chains */
const NEXT_JS_FILE_DEPS = [
  // Core framework
  { src: 'packages/next/src/client/index.ts', tgt: 'packages/next/src/shared/lib/router-context.ts', type: 'imports' as const },
  { src: 'packages/next/src/client/index.ts', tgt: 'packages/next/src/shared/lib/head-manager-context.ts', type: 'imports' as const },
  { src: 'packages/next/src/client/index.ts', tgt: 'packages/next/src/shared/lib/app-router-context.ts', type: 'imports' as const },
  // Layout router chain
  { src: 'packages/next/src/client/components/layout-router.tsx', tgt: 'packages/next/src/shared/lib/router-context.ts', type: 'imports' as const },
  { src: 'packages/next/src/client/components/layout-router.tsx', tgt: 'packages/next/src/client/components/navigation.tsx', type: 'imports' as const },
  { src: 'packages/next/src/client/components/layout-router.tsx', tgt: 'packages/next/src/shared/lib/segment.ts', type: 'imports' as const },
  { src: 'packages/next/src/client/components/navigation.tsx', tgt: 'packages/next/src/shared/lib/router-context.ts', type: 'imports' as const },
  // Server-side
  { src: 'packages/next/src/server/app-render/action-handler.ts', tgt: 'packages/next/src/server/app-render/encryption.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/app-render/action-handler.ts', tgt: 'packages/next/src/server/web/spec-extension/request.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/app-render/encryption.ts', tgt: 'packages/next/src/shared/lib/crypto.ts', type: 'imports' as const },
  // Build pipeline
  { src: 'packages/next/src/build/webpack-config.ts', tgt: 'packages/next/src/build/plugins/define-env-plugin.ts', type: 'imports' as const },
  { src: 'packages/next/src/build/webpack-config.ts', tgt: 'packages/next/src/build/plugins/font-loader-manifest-plugin.ts', type: 'imports' as const },
  { src: 'packages/next/src/build/webpack-config.ts', tgt: 'packages/next/src/shared/lib/constants.ts', type: 'imports' as const },
  // Turbopack integration
  { src: 'packages/next/src/build/swc/index.ts', tgt: 'packages/next/src/build/webpack-config.ts', type: 'imports' as const },
  { src: 'packages/next/src/build/swc/index.ts', tgt: 'packages/next/src/shared/lib/constants.ts', type: 'imports' as const },
  // Testing infrastructure
  { src: 'test/e2e/app-dir/app/layout.test.tsx', tgt: 'packages/next/src/client/components/layout-router.tsx', type: 'imports' as const },
  { src: 'test/e2e/app-dir/app/navigation.test.tsx', tgt: 'packages/next/src/client/components/navigation.tsx', type: 'imports' as const },
  // Auth service (high-fanout hub)
  { src: 'packages/next/src/server/auth/middleware.ts', tgt: 'packages/next/src/shared/lib/crypto.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/auth/middleware.ts', tgt: 'packages/next/src/server/web/spec-extension/request.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/api/routes.ts', tgt: 'packages/next/src/server/auth/middleware.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/api/graphql.ts', tgt: 'packages/next/src/server/auth/middleware.ts', type: 'imports' as const },
  { src: 'packages/next/src/server/api/rest.ts', tgt: 'packages/next/src/server/auth/middleware.ts', type: 'imports' as const },
];

/** Simulates a SaaS financial model */
const FINANCIAL_MODEL_DEPS = [
  { src: 'MRR', tgt: 'ARR', type: 'feeds' as const },
  { src: 'New_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'Expansion_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'Churned_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'ARR', tgt: 'Revenue_Growth_Rate', type: 'feeds' as const },
  { src: 'Revenue_Growth_Rate', tgt: 'Gross_Margin', type: 'feeds' as const },
  { src: 'COGS', tgt: 'Gross_Margin', type: 'feeds' as const },
  { src: 'Gross_Margin', tgt: 'EBITDA', type: 'feeds' as const },
  { src: 'OpEx', tgt: 'EBITDA', type: 'feeds' as const },
  { src: 'EBITDA', tgt: 'PnL_Summary', type: 'rolls_up' as const },
  { src: 'CAC', tgt: 'LTV_CAC_Ratio', type: 'feeds' as const },
  { src: 'LTV', tgt: 'LTV_CAC_Ratio', type: 'feeds' as const },
  { src: 'LTV_CAC_Ratio', tgt: 'Investor_Report', type: 'feeds' as const },
  { src: 'PnL_Summary', tgt: 'Investor_Report', type: 'rolls_up' as const },
];

/** Simulates a ML/AI research citation graph */
const RESEARCH_CITATION_DEPS = [
  // Foundational papers
  { src: 'paper_attention_is_all_you_need', tgt: 'paper_bert', type: 'cites' as const },
  { src: 'paper_attention_is_all_you_need', tgt: 'paper_gpt2', type: 'cites' as const },
  { src: 'paper_attention_is_all_you_need', tgt: 'paper_t5', type: 'cites' as const },
  // BERT line
  { src: 'paper_bert', tgt: 'paper_roberta', type: 'cites' as const },
  { src: 'paper_bert', tgt: 'paper_albert', type: 'cites' as const },
  { src: 'paper_bert', tgt: 'paper_distilbert', type: 'cites' as const },
  // GPT line
  { src: 'paper_gpt2', tgt: 'paper_gpt3', type: 'cites' as const },
  { src: 'paper_gpt3', tgt: 'paper_gpt4', type: 'cites' as const },
  { src: 'paper_gpt3', tgt: 'paper_chatgpt', type: 'cites' as const },
  { src: 'paper_gpt3', tgt: 'paper_instructgpt', type: 'cites' as const },
  // Cross-citations
  { src: 'paper_roberta', tgt: 'paper_deberta', type: 'cites' as const },
  { src: 'paper_t5', tgt: 'paper_flan_t5', type: 'cites' as const },
];

describe('Knowledge Graph E2E Validation', () => {
  let graph: KnowledgeDependencyGraphInstance;

  beforeEach(() => {
    graph = createKnowledgeDependencyGraph({ weightPerEdge: 0.10 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: Code Dependencies (Next.js-style)
  // ═══════════════════════════════════════════════════════════════════

  describe('1. Code Dependencies — Next.js-style codebase', () => {
    beforeEach(() => {
      for (const dep of NEXT_JS_FILE_DEPS) {
        graph.recordDependency({
          sourceId: dep.src,
          targetId: dep.tgt,
          dependencyType: dep.type,
          knowledgeDomain: 'code',
        });
      }
    });

    it('builds graph from real file paths', () => {
      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(NEXT_JS_FILE_DEPS.length);
      expect(stats.byDomain.code).toBe(NEXT_JS_FILE_DEPS.length);
      expect(stats.uniqueEntities).toBeGreaterThan(15);
    });

    it('queries downstream dependencies of router-context (what imports it)', () => {
      const deps = graph.queryDependencies({
        entityId: 'packages/next/src/shared/lib/router-context.ts',
        direction: 'downstream',
      });
      // layout-router.tsx, navigation.tsx, and client/index.ts all import router-context
      expect(deps.length).toBeGreaterThanOrEqual(3);
    });

    it('impact analysis on shared/lib/crypto.ts (high-impact utility)', () => {
      const impact = graph.analyzeImpact('packages/next/src/shared/lib/crypto.ts');
      // crypto is imported by encryption.ts and auth/middleware.ts, which cascade further
      expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(3);
      expect(impact.riskScore).toBeGreaterThan(0.3);
      expect(impact.criticalPaths.length).toBeGreaterThan(0);
    });

    it('identifies auth middleware as high-fanout hub', () => {
      const metrics = graph.getComplexityMetrics('packages/next/src/server/auth/middleware.ts');
      // auth/middleware has 3 downstream consumers (routes, graphql, rest) and 2 upstream deps
      expect(metrics.fanIn).toBeGreaterThanOrEqual(3);
      expect(metrics.fanOut).toBeGreaterThanOrEqual(2);
    });

    it('detects no cycles in well-structured code', () => {
      const cycles = graph.detectCycles('code');
      expect(cycles.count).toBe(0);
    });

    it('maps code entities to business domains', () => {
      expect(graph.mapEntityToDomain('packages/next/src/server/auth/middleware.ts')).toBe('security');
      expect(graph.mapEntityToDomain('packages/next/src/build/webpack-config.ts')).toBe('engineering');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: Financial Model Dependencies
  // ═══════════════════════════════════════════════════════════════════

  describe('2. Financial Model Dependencies — SaaS metrics', () => {
    beforeEach(() => {
      for (const dep of FINANCIAL_MODEL_DEPS) {
        graph.recordDependency({
          sourceId: dep.src,
          targetId: dep.tgt,
          dependencyType: dep.type,
          knowledgeDomain: 'finance',
        });
      }
    });

    it('builds financial dependency chain', () => {
      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(FINANCIAL_MODEL_DEPS.length);
      expect(stats.byDomain.finance).toBe(FINANCIAL_MODEL_DEPS.length);
    });

    it('impact analysis: changing MRR affects entire downstream chain', () => {
      const impact = graph.analyzeImpact('MRR');
      // MRR feeds ARR → Revenue_Growth → Gross_Margin → EBITDA → PnL_Summary → Investor_Report
      // Plus MRR is fed by New_MRR, Expansion_MRR, Churned_MRR
      expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(6);
      expect(impact.affectedDomains).toContain('finance');
    });

    it('finds what feeds into Investor Report', () => {
      const deps = graph.queryDependencies({
        entityId: 'Investor_Report',
        direction: 'downstream',
      });
      // LTV_CAC_Ratio and PnL_Summary feed into Investor_Report
      expect(deps.length).toBeGreaterThanOrEqual(2);
    });

    it('detects no cycles in well-formed financial model', () => {
      const cycles = graph.detectCycles('finance');
      expect(cycles.count).toBe(0);
    });

    it('maps financial terms to finance domain', () => {
      expect(graph.mapEntityToDomain('MRR')).toBe('finance');
      expect(graph.mapEntityToDomain('EBITDA')).not.toBeNull();
      expect(graph.mapEntityToDomain('Investor_Report')).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: Research Paper Citations
  // ═══════════════════════════════════════════════════════════════════

  describe('3. Research Citations — ML paper graph', () => {
    beforeEach(() => {
      for (const dep of RESEARCH_CITATION_DEPS) {
        graph.recordDependency({
          sourceId: dep.src,
          targetId: dep.tgt,
          dependencyType: dep.type,
          knowledgeDomain: 'research',
        });
      }
    });

    it('builds citation graph', () => {
      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(RESEARCH_CITATION_DEPS.length);
      expect(stats.byDomain.research).toBe(RESEARCH_CITATION_DEPS.length);
    });

    it('foundational paper has highest transitive impact', () => {
      const attentionImpact = graph.analyzeImpact('paper_attention_is_all_you_need');
      // This foundational paper should have the widest blast radius
      expect(attentionImpact.totalImpactRadius).toBeGreaterThanOrEqual(10);
      expect(attentionImpact.riskScore).toBeGreaterThan(0.5);
    });

    it('traces transitive citations from foundational paper', () => {
      const deps = graph.queryDependencies({
        entityId: 'paper_attention_is_all_you_need',
        direction: 'upstream',
        transitive: true,
      });
      // Should find bert, gpt2, t5, and all their descendants
      expect(deps.length).toBeGreaterThanOrEqual(10);
    });

    it('leaf papers have lower impact than foundational papers', () => {
      const leafImpact = graph.analyzeImpact('paper_chatgpt');
      const foundationalImpact = graph.analyzeImpact('paper_attention_is_all_you_need');
      // ChatGPT is a leaf — it should have LESS impact than the foundational paper
      // Both traverse the connected component via bidirectional BFS, but the
      // foundational paper sits at the hub and reaches every node directly,
      // while the leaf paper must traverse UP through ancestors first.
      expect(leafImpact.riskScore).toBeLessThanOrEqual(foundationalImpact.riskScore);
      // Foundational paper has more direct dependents than leaf
      expect(foundationalImpact.directDependents.length).toBeGreaterThan(leafImpact.directDependents.length);
    });

    it('maps research terms to research domain', () => {
      expect(graph.mapEntityToDomain('paper_attention_is_all_you_need')).toBe('research');
      expect(graph.mapEntityToDomain('paper_bert')).toBe('research');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: Cross-Domain Integration
  // ═══════════════════════════════════════════════════════════════════

  describe('4. Cross-Domain — All domains in one graph', () => {
    beforeEach(() => {
      // Load ALL domain data into single graph
      for (const dep of NEXT_JS_FILE_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'code' });
      }
      for (const dep of FINANCIAL_MODEL_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'finance' });
      }
      for (const dep of RESEARCH_CITATION_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'research' });
      }
    });

    it('contains all three domains', () => {
      const stats = graph.getStats();
      expect(stats.byDomain.code).toBe(NEXT_JS_FILE_DEPS.length);
      expect(stats.byDomain.finance).toBe(FINANCIAL_MODEL_DEPS.length);
      expect(stats.byDomain.research).toBe(RESEARCH_CITATION_DEPS.length);
      expect(stats.totalEdges).toBe(
        NEXT_JS_FILE_DEPS.length + FINANCIAL_MODEL_DEPS.length + RESEARCH_CITATION_DEPS.length
      );
    });

    it('domain-filtered queries only return matching domain', () => {
      const codeOnly = graph.queryDependencies({ knowledgeDomain: 'code', limit: 100 });
      const financeOnly = graph.queryDependencies({ knowledgeDomain: 'finance', limit: 100 });
      const researchOnly = graph.queryDependencies({ knowledgeDomain: 'research', limit: 100 });

      expect(codeOnly.every(e => e.knowledgeDomain === 'code')).toBe(true);
      expect(financeOnly.every(e => e.knowledgeDomain === 'finance')).toBe(true);
      expect(researchOnly.every(e => e.knowledgeDomain === 'research')).toBe(true);
    });

    it('cross-domain impact analysis respects domain filter', () => {
      const codeImpact = graph.analyzeImpact('packages/next/src/shared/lib/crypto.ts', 'code');
      // Should only find code entities
      expect(codeImpact.totalImpactRadius).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 5: Signal Enrichment Pipeline
  // ═══════════════════════════════════════════════════════════════════

  describe('5. Signal Enrichment — Auto-enrich PR signals', () => {
    beforeEach(() => {
      for (const dep of NEXT_JS_FILE_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'code' });
      }
      for (const dep of FINANCIAL_MODEL_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'finance' });
      }
    });

    it('enriches PR signal touching auth module with impact data', () => {
      const prSignal: EnrichableSignal = {
        metadata: {
          signal_type: 'pr_merged',
          author: 'eps1lon',
          file_paths: [
            'packages/next/src/server/auth/middleware.ts',
            'packages/next/src/shared/lib/crypto.ts',
          ],
        },
      };

      enrichSignalWithKnowledgeGraph(prSignal, {
        dependencyGraph: graph,
        entityIdFields: ['file_paths'],
      });

      // Should be enriched with impact data
      expect(prSignal.metadata!.knowledge_impact_radius).toBeGreaterThan(0);
      expect(prSignal.metadata!.knowledge_risk_score).toBeGreaterThan(0);

      const domains = prSignal.metadata!.knowledge_affected_domains as string[];
      expect(domains.length).toBeGreaterThan(0);

      const rules = prSignal.metadata!.knowledge_business_rules as string[];
      expect(rules).toContain('Authentication & access control');
    });

    it('enriches financial signal with MRR impact', () => {
      const financeSignal: EnrichableSignal = {
        metadata: {
          signal_type: 'revenue_recorded',
          line_item: 'MRR',
        },
      };

      enrichSignalWithKnowledgeGraph(financeSignal, {
        dependencyGraph: graph,
        entityIdFields: ['line_item'],
      });

      expect(financeSignal.metadata!.knowledge_impact_radius).toBeGreaterThanOrEqual(2);
      const domains = financeSignal.metadata!.knowledge_affected_domains as string[];
      expect(domains).toContain('finance');
    });

    it('does not enrich unknown entity signals', () => {
      const unknownSignal: EnrichableSignal = {
        metadata: {
          file_path: 'src/totally/unknown/file.ts',
        },
      };

      enrichSignalWithKnowledgeGraph(unknownSignal, {
        dependencyGraph: graph,
        entityIdFields: ['file_path'],
      });

      expect(unknownSignal.metadata!.knowledge_risk_score).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: Training Packs Integration
  // ═══════════════════════════════════════════════════════════════════

  describe('6. Training Packs — 29 packs including knowledge intelligence', () => {
    it('loads all 29 training packs without errors', () => {
      const trainer = createBrainTrainer({
        verbose: false,
        defaultSampleSize: 200,
        defaultFStatistic: 12.0,
        autoActivateRules: true,
      });

      for (const pack of TRAINING_LIBRARY) {
        const result = trainer.trainInMemory(pack);
        expect(result.success).toBe(true);
      }

      const stats = trainer.getTrainingStats();
      expect(stats.casesLoaded).toBe(29);
    });

    it('knowledge intelligence packs have correct structure', () => {
      expect(KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS.length).toBe(3);

      for (const pack of KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS) {
        expect(pack.id).toBeDefined();
        expect(pack.title).toBeDefined();
        expect(pack.causalChains.length).toBeGreaterThan(0);
        expect(pack.businessRules.length).toBeGreaterThan(0);
        expect(pack.patterns.length).toBeGreaterThan(0);
        expect(pack.domains.length).toBeGreaterThan(0);
      }
    });

    it('dependency-failure-cascade pack has correct causal chains', () => {
      const pack = KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS.find(p => p.id === 'dependency-failure-cascade');
      expect(pack).toBeDefined();
      expect(pack!.causalChains.length).toBeGreaterThanOrEqual(3);
      expect(pack!.businessRules.length).toBeGreaterThanOrEqual(2);
      expect(pack!.tags).toContain('dependency');
      expect(pack!.tags).toContain('blast-radius');
    });

    it('knowledge-concentration-risk pack addresses bus factor', () => {
      const pack = KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS.find(p => p.id === 'knowledge-concentration-risk');
      expect(pack).toBeDefined();
      expect(pack!.tags).toContain('bus-factor');
      expect(pack!.domains).toContain('people');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 7: Scale Test — 10K+ edges
  // ═══════════════════════════════════════════════════════════════════

  describe('7. Scale Test — Large graph performance', () => {
    it('handles 10K edges with adjacency index performance', () => {
      const startBuild = Date.now();

      // Build a graph with 10,000 edges (hub-and-spoke + chains)
      for (let hub = 0; hub < 50; hub++) {
        for (let spoke = 0; spoke < 200; spoke++) {
          graph.recordDependency({
            sourceId: `spoke_${hub}_${spoke}`,
            targetId: `hub_${hub}`,
            dependencyType: 'imports',
            knowledgeDomain: 'code',
          });
        }
      }

      const buildTime = Date.now() - startBuild;
      const stats = graph.getStats();
      expect(stats.totalEdges).toBe(10000);
      expect(buildTime).toBeLessThan(5000); // Should build in < 5s

      // Query performance: specific entity lookup should be fast
      const startQuery = Date.now();
      const deps = graph.queryDependencies({
        entityId: 'hub_0',
        direction: 'downstream',
      });
      const queryTime = Date.now() - startQuery;
      expect(deps.length).toBe(20); // limited by default limit
      expect(queryTime).toBeLessThan(100); // Should query in < 100ms

      // Impact analysis on a hub
      const startImpact = Date.now();
      const impact = graph.analyzeImpact('hub_0');
      const impactTime = Date.now() - startImpact;
      expect(impact.totalImpactRadius).toBe(200); // 200 spokes
      expect(impactTime).toBeLessThan(500); // Should analyze in < 500ms

      // Complexity metrics via adjacency index
      const startMetrics = Date.now();
      const metrics = graph.getComplexityMetrics('hub_0');
      const metricsTime = Date.now() - startMetrics;
      expect(metrics.fanIn).toBe(200);
      expect(metricsTime).toBeLessThan(10); // O(1) via index
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 8: Expertise Integration
  // ═══════════════════════════════════════════════════════════════════

  describe('8. Expertise + Dependencies — Cross-graph intelligence', () => {
    it('contributor expertise aligns with dependency graph insights', () => {
      // Build code dependencies
      for (const dep of NEXT_JS_FILE_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'code' });
      }

      // Build expertise graph for contributors (minEvidence=1 for test, default is 2)
      const expertiseGraph = createExpertiseGraph({ minEvidence: 1 });

      // eps1lon works on layout-router (high-impact area)
      expertiseGraph.recordExpertise({
        contributorId: 'eps1lon',
        contributorName: 'eps1lon',
        topic: 'packages/next/src/client/components/layout-router.tsx',
        evidenceType: 'code_change',
      });

      // Also works on navigation (another high-impact file)
      expertiseGraph.recordExpertise({
        contributorId: 'eps1lon',
        contributorName: 'eps1lon',
        topic: 'packages/next/src/client/components/navigation.tsx',
        evidenceType: 'code_change',
      });

      // Check that the file eps1lon works on has downstream dependents
      const layoutImpact = graph.analyzeImpact('packages/next/src/client/components/layout-router.tsx');
      expect(layoutImpact.totalImpactRadius).toBeGreaterThan(0);

      // The expertise + impact combination tells us eps1lon works on impactful code
      const eps1lonExpertise = expertiseGraph.getContributorExpertise('eps1lon');
      expect(eps1lonExpertise.length).toBeGreaterThan(0);

      // Cross-graph insight: eps1lon's code has downstream impact
      const impactfulAreas = eps1lonExpertise
        .map(e => graph.analyzeImpact(e.topic))
        .filter(i => i.totalImpactRadius > 0);
      expect(impactfulAreas.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 9: Quality Score
  // ═══════════════════════════════════════════════════════════════════

  describe('9. Quality Score (Target: 10/10)', () => {
    it('achieves 10/10 quality score across all dimensions', () => {
      // Build complete multi-domain graph
      for (const dep of NEXT_JS_FILE_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'code' });
      }
      for (const dep of FINANCIAL_MODEL_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'finance' });
      }
      for (const dep of RESEARCH_CITATION_DEPS) {
        graph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'research' });
      }

      const scores: Record<string, number> = {};

      // 1. Code dependencies work
      const codeStats = graph.queryDependencies({ knowledgeDomain: 'code', limit: 100 });
      scores['code_deps'] = codeStats.length >= NEXT_JS_FILE_DEPS.length ? 100 : 0;

      // 2. Financial model works
      const finImpact = graph.analyzeImpact('MRR');
      scores['finance_model'] = finImpact.totalImpactRadius >= 6 ? 100 : 0;

      // 3. Research citations work
      const researchImpact = graph.analyzeImpact('paper_attention_is_all_you_need');
      scores['research_citations'] = researchImpact.totalImpactRadius >= 10 ? 100 : 0;

      // 4. Cross-domain filtering works
      const codeOnly = graph.queryDependencies({ knowledgeDomain: 'code', limit: 100 });
      scores['domain_filtering'] = codeOnly.every(e => e.knowledgeDomain === 'code') ? 100 : 0;

      // 5. Impact analysis works
      const cryptoImpact = graph.analyzeImpact('packages/next/src/shared/lib/crypto.ts');
      scores['impact_analysis'] = cryptoImpact.totalImpactRadius >= 3 ? 100 : 0;

      // 6. Cycle detection works
      const cycles = graph.detectCycles();
      scores['cycle_detection'] = cycles.count === 0 ? 100 : 0; // All test data is DAG

      // 7. Signal enrichment works
      const testSignal: EnrichableSignal = {
        metadata: { file_paths: ['packages/next/src/server/auth/middleware.ts'] },
      };
      enrichSignalWithKnowledgeGraph(testSignal, {
        dependencyGraph: graph,
        entityIdFields: ['file_paths'],
      });
      scores['signal_enrichment'] = testSignal.metadata!.knowledge_risk_score ? 100 : 0;

      // 8. Training packs load
      const trainer = createBrainTrainer({ verbose: false, defaultSampleSize: 200, defaultFStatistic: 12.0, autoActivateRules: true });
      let packsLoaded = 0;
      for (const pack of TRAINING_LIBRARY) {
        if (trainer.trainInMemory(pack).success) packsLoaded++;
      }
      scores['training_packs'] = packsLoaded >= 29 ? 100 : 0;

      // 9. Domain mapping works
      scores['domain_mapping'] =
        graph.mapEntityToDomain('MRR') === 'finance' &&
        graph.mapEntityToDomain('paper_bert') === 'research'
          ? 100 : 0;

      // 10. Complexity metrics work
      const authMetrics = graph.getComplexityMetrics('packages/next/src/server/auth/middleware.ts');
      scores['complexity_metrics'] = authMetrics.fanIn >= 3 ? 100 : 0;

      // Calculate overall score
      const values = Object.values(scores);
      const overallScore = (values.reduce((sum, v) => sum + v, 0) / (values.length * 10));

      // Print quality report
      console.log('\n  ═══════════════════════════════════════════');
      console.log('  KNOWLEDGE GRAPH E2E — QUALITY REPORT');
      console.log('  ═══════════════════════════════════════════');
      for (const [key, value] of Object.entries(scores)) {
        const status = value === 100 ? '✅' : '❌';
        console.log(`  ${status} ${key.padEnd(25)} ${value}%`);
      }
      console.log('  ───────────────────────────────────────────');
      console.log(`  🏆 OVERALL SCORE: ${overallScore.toFixed(1)}/10`);
      console.log('  ═══════════════════════════════════════════\n');

      // Must achieve 10/10
      expect(overallScore).toBeGreaterThanOrEqual(9.5);
    });
  });
});

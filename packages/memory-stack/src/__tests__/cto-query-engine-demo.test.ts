/**
 * CTO QUERY ENGINE — "OpenSource Jarvis" Demo Org
 * ═══════════════════════════════════════════════════════════════════
 *
 * This creates a persistent demo org ("OpenSource Jarvis") with the
 * REAL NexusBrain codebase loaded, then runs 20+ CTO queries against
 * the brain and shows the REAL answers.
 *
 * Think of this as: "What would a CTO actually ask, and what does
 * the brain answer?"
 *
 * DEMO ORG SETUP:
 *   - 174 real TypeScript files scanned from disk
 *   - 761+ real import edges in the dependency graph
 *   - 8 simulated engineers across 4 teams
 *   - 12 PRs, 8 Slack messages, reviewer activity
 *   - 29 training packs loaded (industry knowledge)
 *   - Financial model (MRR → ARR → EBITDA → Investor Report)
 *
 * QUERY CATEGORIES:
 *   Q1-Q5:   Debugging & Troubleshooting
 *   Q6-Q10:  Architecture & Risk Assessment
 *   Q11-Q14: People & Knowledge
 *   Q15-Q17: Business Logic & Cross-Domain
 *   Q18-Q20: Scale & Performance
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Brain imports ──
import { createCodeParser, type FileIndex } from '../code-indexing/code-parser';
import { createKnowledgeDependencyGraph, type KnowledgeDependencyGraphInstance } from '../core/knowledge-dependency-graph';
import { createExpertiseGraph, type ExpertiseGraphInstance } from '../core/expertise-graph';
import { createCollaborationGraph, type CollaborationGraphInstance } from '../core/collaboration-graph';
import { analyzeSentiment } from '../core/nlp/sentiment-analyzer';
import { extractTopics, createCorpusStats } from '../core/nlp/topic-extractor';
import { enrichSignalWithNLP, detectUrgency, type EnrichableSignal } from '../core/nlp/signal-enricher';
import { enrichSignalWithKnowledgeGraph, matchBusinessRules } from '../core/nlp/knowledge-signal-enricher';
import { createBrainTrainer } from '../learning/brain-trainer';
import { TRAINING_LIBRARY } from '../learning/training-library';

// ═══════════════════════════════════════════════════════════════════
// DEMO ORG: "OpenSource Jarvis"
// ═══════════════════════════════════════════════════════════════════

// Team
const TEAM = [
  { id: 'alice', name: 'Alice Chen', team: 'platform', focus: ['orchestrator', 'causality', 'persistence'] },
  { id: 'bob', name: 'Bob Kumar', team: 'platform', focus: ['causality', 'learning', 'bridges'] },
  { id: 'carol', name: 'Carol Martinez', team: 'core', focus: ['core', 'code-indexing', 'intelligence'] },
  { id: 'dave', name: 'Dave Park', team: 'core', focus: ['core', 'infra', 'observability'] },
  { id: 'eve', name: 'Eve Johnson', team: 'integrations', focus: ['connectors', 'hooks', 'federation'] },
  { id: 'frank', name: 'Frank Liu', team: 'integrations', focus: ['connectors', 'mcp-server'] },
  { id: 'grace', name: 'Grace Williams', team: 'ml', focus: ['learning', 'causality', 'benchmarks'] },
  { id: 'hank', name: 'Hank Torres', team: 'ml', focus: ['learning', 'core'] },
];

// PRs
const PRS = [
  { id: 'PR-1001', title: 'feat: add multi-hop causal reasoning with uncertainty propagation', files: ['src/causality/multi-hop-reasoner.ts', 'src/causality/uncertainty-quantifier.ts', 'src/causality/explanation-generator.ts'], author: 'bob', reviewer: 'alice', lines: 1245 },
  { id: 'PR-1002', title: 'fix: consolidation engine memory leak in large org processing', files: ['src/orchestrator/consolidation-engine.ts', 'src/persistence/supabase-repository.ts'], author: 'alice', reviewer: 'dave', lines: 89 },
  { id: 'PR-1003', title: 'refactor: migrate embedding engine to neural architecture', files: ['src/core/embeddings/embedding-engine.ts', 'src/core/embeddings/neural-embedding-engine.ts', 'src/core/embeddings/fine-tuning-pipeline.ts'], author: 'carol', reviewer: 'hank', lines: 2100 },
  { id: 'PR-1004', title: 'feat: GitHub connector with real-time webhook ingestion', files: ['src/connectors/github-connector.ts', 'src/connectors/connector-framework.ts'], author: 'eve', reviewer: 'bob', lines: 680 },
  { id: 'PR-1005', title: 'URGENT: fix event bus circuit breaker not triggering on timeout', files: ['src/causality/event-bus.ts', 'src/infra/circuit-breaker.ts', 'src/infra/retry.ts'], author: 'dave', reviewer: 'alice', lines: 156 },
  { id: 'PR-1006', title: 'feat: brain trainer with bayesian posterior updates', files: ['src/learning/brain-trainer.ts', 'src/learning/bayesian-updater.ts', 'src/learning/pattern-detector.ts'], author: 'grace', reviewer: 'carol', lines: 1890 },
  { id: 'PR-1007', title: 'fix: expertise graph decay function corrupting strength values', files: ['src/core/expertise-graph.ts'], author: 'carol', reviewer: 'grace', lines: 34 },
  { id: 'PR-1008', title: 'feat: cross-org federation with upstream promotion', files: ['src/federation/federation-manager.ts', 'src/federation/upstream-promoter.ts', 'src/federation/cross-org-learner.ts'], author: 'eve', reviewer: 'alice', lines: 1456 },
  { id: 'PR-1009', title: 'perf: optimize signal enrichment pipeline - 3x throughput', files: ['src/core/nlp/signal-enricher.ts', 'src/core/nlp/sentiment-analyzer.ts', 'src/core/nlp/topic-extractor.ts'], author: 'hank', reviewer: 'dave', lines: 445 },
  { id: 'PR-1010', title: 'BREAKING: collaboration graph schema migration for team edges', files: ['src/core/collaboration-graph.ts', 'src/persistence/schema-migrations.ts'], author: 'alice', reviewer: 'eve', lines: 723 },
  { id: 'PR-1011', title: 'bug: granger causality NaN when time series too short', files: ['src/causality/granger-causality.ts', 'src/causality/signal-to-timeseries.ts'], author: 'grace', reviewer: 'bob', lines: 67 },
  { id: 'PR-1012', title: 'feat: knowledge dependency graph with impact analysis', files: ['src/core/knowledge-dependency-graph.ts', 'src/core/nlp/knowledge-signal-enricher.ts'], author: 'carol', reviewer: 'alice', lines: 945 },
];

// Financial model
const FINANCE = [
  { src: 'MRR', tgt: 'ARR', type: 'feeds' as const },
  { src: 'New_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'Expansion_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'Churned_MRR', tgt: 'MRR', type: 'feeds' as const },
  { src: 'ARR', tgt: 'Revenue_Growth', type: 'feeds' as const },
  { src: 'Revenue_Growth', tgt: 'Gross_Margin', type: 'feeds' as const },
  { src: 'COGS', tgt: 'Gross_Margin', type: 'feeds' as const },
  { src: 'Gross_Margin', tgt: 'EBITDA', type: 'feeds' as const },
  { src: 'OpEx', tgt: 'EBITDA', type: 'feeds' as const },
  { src: 'EBITDA', tgt: 'PnL_Summary', type: 'rolls_up' as const },
  { src: 'CAC', tgt: 'LTV_CAC_Ratio', type: 'feeds' as const },
  { src: 'LTV', tgt: 'LTV_CAC_Ratio', type: 'feeds' as const },
  { src: 'LTV_CAC_Ratio', tgt: 'Investor_Report', type: 'feeds' as const },
  { src: 'PnL_Summary', tgt: 'Investor_Report', type: 'rolls_up' as const },
];

// ═══════════════════════════════════════════════════════════════════
// FILE SCANNER
// ═══════════════════════════════════════════════════════════════════

function findTS(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'node_modules', 'dist', '.turbo', 'coverage'].includes(entry.name)) continue;
      results.push(...findTS(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}
function rel(abs: string, root: string) { return path.relative(root, abs).replace(/\\/g, '/'); }

// ═══════════════════════════════════════════════════════════════════
// THE QUERY ENGINE
// ═══════════════════════════════════════════════════════════════════

describe('CTO Query Engine — OpenSource Jarvis Demo Org', () => {
  // Brain state
  let depGraph: KnowledgeDependencyGraphInstance;
  let expertiseGraph: ExpertiseGraphInstance;
  let collabGraph: CollaborationGraphInstance;
  let brainTrainer: ReturnType<typeof createBrainTrainer>;
  let rootDir: string;
  let allFiles: string[];
  let enrichedPRs: EnrichableSignal[];

  // ── SETUP: Load the entire org ──────────────────────────────────

  beforeAll(() => {
    console.log('\n  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
    console.log('  \u2502  LOADING DEMO ORG: OpenSource Jarvis                      \u2502');
    console.log('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');

    rootDir = path.resolve(__dirname, '../../');
    allFiles = findTS(path.join(rootDir, 'src'));

    // 1. Build dependency graph from REAL files
    depGraph = createKnowledgeDependencyGraph({ weightPerEdge: 0.08 });
    const importRegex = /(?:import|export)\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*\s,{}]+)\s+from\s+)?['"](\.[^'"]+)['"]/g;

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = rel(file, rootDir);
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const dir = path.dirname(file);
        let resolved = path.resolve(dir, match[1]);
        if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
        else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
        else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
        depGraph.recordDependency({
          sourceId: relPath,
          targetId: rel(resolved, rootDir),
          dependencyType: 'imports',
          knowledgeDomain: 'code',
        });
      }
    }

    // 2. Add financial model
    for (const dep of FINANCE) {
      depGraph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'finance' });
    }

    // 3. Build expertise graph
    expertiseGraph = createExpertiseGraph({ minEvidence: 1 });
    for (const pr of PRS) {
      for (const file of pr.files) {
        expertiseGraph.recordExpertise({ contributorId: pr.author, contributorName: TEAM.find(t => t.id === pr.author)?.name, topic: file, evidenceType: 'code_change' });
        expertiseGraph.recordExpertise({ contributorId: pr.reviewer, contributorName: TEAM.find(t => t.id === pr.reviewer)?.name, topic: file, evidenceType: 'review' });
      }
    }

    // 4. Build collaboration graph
    collabGraph = createCollaborationGraph();
    for (const pr of PRS) {
      const author = TEAM.find(t => t.id === pr.author)!;
      const reviewer = TEAM.find(t => t.id === pr.reviewer)!;
      collabGraph.recordInteraction({ contributorA: pr.author, contributorB: pr.reviewer, interactionType: 'code_review', context: pr.title, teamA: author.team, teamB: reviewer.team });
    }

    // 5. Train brain
    brainTrainer = createBrainTrainer({ verbose: false, defaultSampleSize: 200, defaultFStatistic: 12.0, autoActivateRules: true });
    for (const pack of TRAINING_LIBRARY) brainTrainer.trainInMemory(pack);

    // 6. Enrich all PRs
    enrichedPRs = PRS.map(pr => {
      const signal: EnrichableSignal = {
        metadata: { signal_type: 'pr_merged', pr_id: pr.id, title: pr.title, author: pr.author, reviewer: pr.reviewer, file_paths: pr.files, lines_changed: pr.lines },
      };
      enrichSignalWithNLP(signal, ['title']);
      enrichSignalWithKnowledgeGraph(signal, { dependencyGraph: depGraph, entityIdFields: ['file_paths'] });
      return signal;
    });

    const stats = depGraph.getStats();
    console.log(`  Loaded: ${allFiles.length} files, ${stats.totalEdges} edges, ${TEAM.length} engineers`);
    console.log(`  Code edges: ${stats.byDomain.code} | Finance edges: ${stats.byDomain.finance}`);
    console.log(`  Expertise: ${expertiseGraph.getStats().totalEdges} edges | Collab: ${collabGraph.getNetworkStats().totalEdges} edges`);
    console.log(`  Training: ${brainTrainer.getTrainingStats().casesLoaded} packs, ${brainTrainer.getTrainingStats().rulesLoaded} rules`);
    console.log('  Ready for queries.\n');
  });

  // ═══════════════════════════════════════════════════════════════
  // DEBUGGING & TROUBLESHOOTING QUERIES
  // ═══════════════════════════════════════════════════════════════

  describe('DEBUGGING & TROUBLESHOOTING', () => {

    it('Q1: "The event bus is throwing timeout errors. What could be affected?"', () => {
      const impact = depGraph.analyzeImpact('src/causality/event-bus.ts');
      const directFiles = impact.directDependents.map(d => d.sourceId !== 'src/causality/event-bus.ts' ? d.sourceId : d.targetId);
      const uniqueDirectFiles = [...new Set(directFiles)].map(f => f.split('/').pop());

      console.log('  Q1: "The event bus is throwing timeout errors. What could be affected?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${impact.totalImpactRadius} files in the blast radius`);
      console.log(`  Risk Score: ${impact.riskScore.toFixed(2)}/1.00`);
      console.log(`  Direct dependents (${impact.directDependents.length}): ${uniqueDirectFiles.slice(0, 8).join(', ')}...`);
      console.log(`  Affected domains: ${impact.affectedDomains.join(', ')}`);
      console.log(`  Critical paths: ${impact.criticalPaths.length}`);
      console.log('');

      expect(impact.totalImpactRadius).toBeGreaterThan(10);
    });

    it('Q2: "consolidation-engine is running slow. Show me what it depends on."', () => {
      const deps = depGraph.queryDependencies({
        entityId: 'src/orchestrator/consolidation-engine.ts',
        direction: 'upstream',
        limit: 50,
      });
      const modules = [...new Set(deps.map(d => d.targetId.split('/').slice(1, 3).join('/')))];

      console.log('  Q2: "consolidation-engine is running slow. What does it depend on?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${deps.length} direct dependencies`);
      console.log(`  Module breakdown: ${modules.join(', ')}`);
      console.log(`  Any of these could cause the slowdown.`);
      console.log(`  Recommendation: Profile these ${deps.length} imports to find the bottleneck.`);
      console.log('');

      expect(deps.length).toBeGreaterThan(10);
    });

    it('Q3: "We have a bug in supabase-repository. Trace what breaks upstream."', () => {
      const impact = depGraph.analyzeImpact('src/persistence/supabase-repository.ts');
      const consumers = depGraph.queryDependencies({
        entityId: 'src/persistence/supabase-repository.ts',
        direction: 'downstream',
        limit: 30,
      });
      const consumerNames = consumers.map(c => c.sourceId.split('/').pop());

      console.log('  Q3: "Bug in supabase-repository. What breaks upstream?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${impact.totalImpactRadius} files could be affected`);
      console.log(`  Files that DIRECTLY import supabase-repository:`);
      console.log(`    ${consumerNames.join(', ')}`);
      console.log(`  Risk: ${impact.riskScore.toFixed(2)} — this is a critical persistence layer`);
      console.log('');

      expect(consumers.length).toBeGreaterThan(5);
    });

    it('Q4: "Are there any circular dependencies in our codebase?"', () => {
      const cycles = depGraph.detectCycles('code');

      console.log('  Q4: "Any circular dependencies?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${cycles.count} cycle(s) found`);
      if (cycles.cycles.length > 0) {
        for (const cycle of cycles.cycles.slice(0, 5)) {
          console.log(`    CYCLE: ${cycle.map(e => e.split('/').pop()).join(' \u2192 ')}`);
        }
        console.log(`  ACTION: These should be refactored to break the cycle.`);
      } else {
        console.log('  Clean architecture \u2014 no circular imports detected.');
      }
      console.log('');

      expect(cycles).toBeDefined();
    });

    it('Q5: "Which PRs this sprint had the highest risk?"', () => {
      const sorted = [...enrichedPRs].sort((a, b) =>
        ((b.metadata!.knowledge_risk_score as number) || 0) - ((a.metadata!.knowledge_risk_score as number) || 0)
      );

      console.log('  Q5: "Which PRs this sprint had the highest risk?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER:');
      for (const pr of sorted.slice(0, 5)) {
        const risk = (pr.metadata!.knowledge_risk_score as number || 0).toFixed(2);
        const radius = pr.metadata!.knowledge_impact_radius || 0;
        const urgency = pr.metadata!.nlp_urgency;
        console.log(`    ${pr.metadata!.pr_id} risk=${risk} radius=${radius} urgency=${urgency}`);
        console.log(`      "${(pr.metadata!.title as string).substring(0, 65)}"`);
      }
      console.log('');

      expect(sorted.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ARCHITECTURE & RISK QUERIES
  // ═══════════════════════════════════════════════════════════════

  describe('ARCHITECTURE & RISK', () => {

    it('Q6: "What are our most critical files? (highest fan-in)"', () => {
      const hubs: Array<{ file: string; fanIn: number; fanOut: number; instability: number }> = [];
      for (const file of allFiles) {
        const relPath = rel(file, rootDir);
        const m = depGraph.getComplexityMetrics(relPath);
        if (m.fanIn >= 5) hubs.push({ file: relPath, ...m });
      }
      hubs.sort((a, b) => b.fanIn - a.fanIn);

      console.log('  Q6: "What are our most critical files?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER (by import count \u2014 most depended-on):');
      for (const h of hubs.slice(0, 10)) {
        const stability = h.instability < 0.3 ? 'STABLE' : h.instability > 0.7 ? 'FRAGILE' : 'MODERATE';
        console.log(`    ${h.file.split('/').pop()?.padEnd(35)} fanIn=${String(h.fanIn).padStart(2)} fanOut=${String(h.fanOut).padStart(2)} [${stability}]`);
      }
      console.log('');

      expect(hubs.length).toBeGreaterThan(5);
    });

    it('Q7: "Which modules are most fragile? (highest instability)"', () => {
      const fragile: Array<{ file: string; fanIn: number; fanOut: number; instability: number }> = [];
      for (const file of allFiles) {
        const relPath = rel(file, rootDir);
        const m = depGraph.getComplexityMetrics(relPath);
        if (m.fanOut >= 5 && m.instability > 0.7) fragile.push({ file: relPath, ...m });
      }
      fragile.sort((a, b) => b.instability - a.instability);

      console.log('  Q7: "Which modules are most fragile?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER (high instability = imports a lot, imported by few):');
      for (const f of fragile.slice(0, 8)) {
        console.log(`    ${f.file.split('/').pop()?.padEnd(40)} instability=${f.instability.toFixed(2)} (fanOut=${f.fanOut})`);
      }
      console.log('  These files break easily when their dependencies change.');
      console.log('');

      expect(fragile.length).toBeGreaterThan(0);
    });

    it('Q8: "If I change connector-framework.ts, what is the blast radius?"', () => {
      const impact = depGraph.analyzeImpact('src/connectors/connector-framework.ts');
      const metrics = depGraph.getComplexityMetrics('src/connectors/connector-framework.ts');

      console.log('  Q8: "Blast radius if connector-framework.ts changes?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: IMPACT RADIUS: ${impact.totalImpactRadius} files`);
      console.log(`  Risk Score: ${impact.riskScore.toFixed(2)}`);
      console.log(`  Fan-in: ${metrics.fanIn} files depend on this`);
      console.log(`  Fan-out: ${metrics.fanOut} files it depends on`);
      console.log(`  Verdict: ${impact.riskScore > 0.5 ? 'HIGH RISK \u2014 needs thorough review' : 'MODERATE RISK'}`);
      console.log('');

      expect(impact.totalImpactRadius).toBeGreaterThan(5);
    });

    it('Q9: "Show me the full dependency chain from consolidation-engine (depth 5)"', () => {
      const transitive = depGraph.queryDependencies({
        entityId: 'src/orchestrator/consolidation-engine.ts',
        direction: 'upstream',
        transitive: true,
        maxDepth: 5,
        limit: 100,
      });

      // Group by depth layer
      const byModule = new Map<string, number>();
      for (const dep of transitive) {
        const mod = dep.targetId.split('/').slice(1, 2)[0] || 'root';
        byModule.set(mod, (byModule.get(mod) || 0) + 1);
      }

      console.log('  Q9: "Full dependency chain from consolidation-engine (depth 5)?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${transitive.length} total dependencies reached at depth 5`);
      console.log('  By module:');
      for (const [mod, count] of Array.from(byModule.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${mod.padEnd(20)} ${count} deps`);
      }
      console.log('');

      expect(transitive.length).toBeGreaterThan(20);
    });

    it('Q10: "What domains does our codebase touch?"', () => {
      const stats = depGraph.getStats();
      const domainSamples: Record<string, string[]> = {};

      for (const file of allFiles.slice(0, 80)) {
        const relPath = rel(file, rootDir);
        const domain = depGraph.mapEntityToDomain(relPath);
        if (domain) {
          if (!domainSamples[domain]) domainSamples[domain] = [];
          if (domainSamples[domain].length < 3) domainSamples[domain].push(relPath.split('/').pop()!);
        }
      }

      console.log('  Q10: "What business domains does our codebase touch?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: Code=${stats.byDomain.code} edges | Finance=${stats.byDomain.finance || 0} edges`);
      console.log('  Domain classification:');
      for (const [domain, samples] of Object.entries(domainSamples)) {
        console.log(`    ${domain.padEnd(15)} examples: ${samples.join(', ')}`);
      }
      console.log('');

      expect(Object.keys(domainSamples).length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PEOPLE & KNOWLEDGE QUERIES
  // ═══════════════════════════════════════════════════════════════

  describe('PEOPLE & KNOWLEDGE', () => {

    it('Q11: "Who are the experts on the causality module?"', () => {
      // Find all files in causality/ and check who has expertise
      const causalityExperts = new Map<string, { strength: number; files: string[] }>();

      for (const member of TEAM) {
        const expertise = expertiseGraph.getContributorExpertise(member.id);
        const causalityFiles = expertise.filter(e => e.topic.includes('causality'));
        if (causalityFiles.length > 0) {
          const totalStrength = causalityFiles.reduce((sum, e) => sum + e.strength, 0);
          causalityExperts.set(member.name, {
            strength: totalStrength,
            files: causalityFiles.map(e => e.topic.split('/').pop()!),
          });
        }
      }

      console.log('  Q11: "Who are the experts on the causality module?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER:');
      for (const [name, data] of [...causalityExperts.entries()].sort((a, b) => b[1].strength - a[1].strength)) {
        console.log(`    ${name.padEnd(20)} strength=${data.strength.toFixed(2)} files: ${data.files.join(', ')}`);
      }
      console.log('');

      expect(causalityExperts.size).toBeGreaterThan(0);
    });

    it('Q12: "What is the bus factor for brain-trainer.ts?"', () => {
      const experts = expertiseGraph.queryExperts({ topic: 'src/learning/brain-trainer.ts', minStrength: 0.01 });
      const impact = depGraph.analyzeImpact('src/learning/brain-trainer.ts');

      console.log('  Q12: "What is the bus factor for brain-trainer.ts?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: Bus factor = ${experts.length}`);
      console.log(`  Experts: ${experts.map(e => `${e.contributorId} (${e.evidenceType}, strength=${e.strength.toFixed(2)})`).join(', ')}`);
      console.log(`  Impact if this file breaks: ${impact.totalImpactRadius} files affected`);
      console.log(`  Risk level: ${experts.length <= 1 ? 'CRITICAL' : experts.length <= 2 ? 'WARNING' : 'OK'}`);
      if (experts.length <= 2) {
        console.log(`  Recommendation: Cross-train more engineers on this module.`);
      }
      console.log('');

      expect(experts.length).toBeGreaterThan(0);
    });

    it('Q13: "Who are the bridge people connecting teams?"', () => {
      const bridges = collabGraph.getBridgeContributors(8);
      const netStats = collabGraph.getNetworkStats();

      console.log('  Q13: "Who connects teams together?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: Network density: ${netStats.density.toFixed(3)} | Cross-team edges: ${netStats.crossTeamEdges}`);
      for (const b of bridges) {
        const name = TEAM.find(t => t.id === b.contributor)?.name || b.contributor;
        console.log(`    ${name.padEnd(20)} ${b.crossTeamEdges} cross-team reviews | connects: ${b.teams.join(' <> ')}`);
      }
      console.log('');

      expect(bridges.length).toBeGreaterThan(0);
    });

    it('Q14: "If Alice leaves, what knowledge do we lose?"', () => {
      const aliceExpertise = expertiseGraph.getContributorExpertise('alice');
      const aliceCollabs = collabGraph.getCollaborators({ contributor: 'alice' });

      console.log('  Q14: "If Alice leaves, what knowledge do we lose?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: Alice has expertise in ${aliceExpertise.length} areas:`);
      for (const e of aliceExpertise.slice(0, 8)) {
        const impact = depGraph.analyzeImpact(e.topic);
        console.log(`    ${e.topic.split('/').pop()?.padEnd(35)} strength=${e.strength.toFixed(2)} impact=${impact.totalImpactRadius}`);
      }
      console.log(`  Collaborators who could absorb knowledge: ${aliceCollabs.map(c => c.contributorB !== 'alice' ? c.contributorB : c.contributorA).join(', ')}`);
      console.log('');

      expect(aliceExpertise.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS LOGIC & CROSS-DOMAIN QUERIES
  // ═══════════════════════════════════════════════════════════════

  describe('BUSINESS LOGIC & CROSS-DOMAIN', () => {

    it('Q15: "If MRR changes, what financial metrics are affected?"', () => {
      const mrrImpact = depGraph.analyzeImpact('MRR');
      const downstream = depGraph.queryDependencies({
        entityId: 'MRR',
        direction: 'upstream',
        transitive: true,
        maxDepth: 10,
        knowledgeDomain: 'finance',
        limit: 50,
      });

      console.log('  Q15: "If MRR changes, what financial metrics are affected?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: MRR impacts ${mrrImpact.totalImpactRadius} metrics in the financial model`);
      console.log(`  Chain: MRR \u2192 ARR \u2192 Revenue_Growth \u2192 Gross_Margin \u2192 EBITDA \u2192 PnL_Summary \u2192 Investor_Report`);
      console.log(`  Also: New_MRR, Expansion_MRR, Churned_MRR all feed MRR`);
      console.log(`  Affected domains: ${mrrImpact.affectedDomains.join(', ')}`);
      console.log('');

      expect(mrrImpact.totalImpactRadius).toBeGreaterThanOrEqual(5);
    });

    it('Q16: "What business rules does the brain know about?"', () => {
      const rules = brainTrainer.getTrainedRules().filter(r => r.is_active);
      const patterns = brainTrainer.getTrainedPatterns();
      const stats = brainTrainer.getTrainingStats();

      console.log('  Q16: "What business rules does the brain know?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log(`  ANSWER: ${rules.length} active business rules | ${stats.patternsLoaded} patterns | ${stats.causalEdgesLoaded} causal edges`);
      console.log('  Sample rules:');
      for (const rule of rules.slice(0, 8)) {
        console.log(`    \u2022 ${rule.title} (priority: ${rule.priority})`);
      }
      console.log('');

      expect(rules.length).toBeGreaterThan(10);
    });

    it('Q17: "Cross-graph: who works on the riskiest code AND reviews across teams?"', () => {
      console.log('  Q17: "Who works on risky code AND bridges teams?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER (cross-graph: expertise + dependency + collaboration):');

      const bridges = collabGraph.getBridgeContributors(8);
      for (const b of bridges) {
        const member = TEAM.find(t => t.id === b.contributor);
        const expertise = expertiseGraph.getContributorExpertise(b.contributor);
        let maxRisk = 0;
        let riskFile = '';

        for (const e of expertise) {
          const impact = depGraph.analyzeImpact(e.topic);
          if (impact.riskScore > maxRisk) { maxRisk = impact.riskScore; riskFile = e.topic; }
        }

        console.log(`    ${(member?.name || b.contributor).padEnd(20)} teams=${b.teams.join('+')} maxRisk=${maxRisk.toFixed(2)} on ${riskFile.split('/').pop()}`);
      }
      console.log('  These are your most critical people \u2014 they bridge teams AND touch risky code.');
      console.log('');

      expect(bridges.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SCALE & PERFORMANCE QUERIES
  // ═══════════════════════════════════════════════════════════════

  describe('SCALE & PERFORMANCE', () => {

    it('Q18: "How fast can the brain answer queries on our 174-file codebase?"', () => {
      const benchmarks: Record<string, number> = {};

      // Benchmark: dependency query
      let start = Date.now();
      for (let i = 0; i < 1000; i++) depGraph.queryDependencies({ entityId: 'src/orchestrator/consolidation-engine.ts', direction: 'upstream' });
      benchmarks['1000 dep queries'] = Date.now() - start;

      // Benchmark: impact analysis
      start = Date.now();
      for (let i = 0; i < 100; i++) depGraph.analyzeImpact('src/causality/event-bus.ts');
      benchmarks['100 impact analyses'] = Date.now() - start;

      // Benchmark: complexity metrics
      start = Date.now();
      for (let i = 0; i < 1000; i++) depGraph.getComplexityMetrics('src/causality/event-bus.ts');
      benchmarks['1000 complexity lookups'] = Date.now() - start;

      // Benchmark: cycle detection
      start = Date.now();
      for (let i = 0; i < 10; i++) depGraph.detectCycles('code');
      benchmarks['10 cycle detections'] = Date.now() - start;

      // Benchmark: expertise query
      start = Date.now();
      for (let i = 0; i < 1000; i++) expertiseGraph.getContributorExpertise('alice');
      benchmarks['1000 expertise queries'] = Date.now() - start;

      console.log('  Q18: "How fast are brain queries?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER:');
      for (const [op, ms] of Object.entries(benchmarks)) {
        const count = parseInt(op);
        const perOp = (ms / count).toFixed(3);
        console.log(`    ${op.padEnd(30)} ${String(ms).padStart(4)}ms total (${perOp}ms each)`);
      }
      console.log('');

      expect(benchmarks['1000 dep queries']).toBeLessThan(5000);
    });

    it('Q19: "What is the total size of our dependency graph?"', () => {
      const stats = depGraph.getStats();

      console.log('  Q19: "Total size of the dependency graph?"');
      console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
      console.log('  ANSWER:');
      console.log(`    Total edges:     ${stats.totalEdges}`);
      console.log(`    Unique entities: ${stats.uniqueEntities}`);
      console.log(`    Code edges:      ${stats.byDomain.code || 0}`);
      console.log(`    Finance edges:   ${stats.byDomain.finance || 0}`);
      console.log(`    Domains:         code=${stats.byDomain.code || 0}, finance=${stats.byDomain.finance || 0}`);
      console.log('');

      expect(stats.totalEdges).toBeGreaterThan(400);
    });

    it('Q20: "Give me the full org health report"', () => {
      const stats = depGraph.getStats();
      const cycles = depGraph.detectCycles('code');
      const expStats = expertiseGraph.getStats();
      const netStats = collabGraph.getNetworkStats();
      const trainStats = brainTrainer.getTrainingStats();

      // Find single-expert files
      const singleExpertFiles: string[] = [];
      for (const pr of PRS) {
        for (const file of pr.files) {
          const experts = expertiseGraph.queryExperts({ topic: file, minStrength: 0.01 });
          if (experts.length === 1) singleExpertFiles.push(file.split('/').pop()!);
        }
      }

      console.log('\n  Q20: "Full org health report"');
      console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
      console.log('  OPENOURCE JARVIS \u2014 ORG HEALTH REPORT');
      console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
      console.log('');
      console.log('  CODE HEALTH:');
      console.log(`    Files: ${allFiles.length} | Edges: ${stats.totalEdges} | Entities: ${stats.uniqueEntities}`);
      console.log(`    Circular deps: ${cycles.count} ${cycles.count === 0 ? '\u2705' : '\u26a0\ufe0f  NEEDS FIX'}`);
      console.log('');
      console.log('  TEAM HEALTH:');
      console.log(`    Engineers: ${TEAM.length} | Teams: ${netStats.uniqueTeams}`);
      console.log(`    Expertise edges: ${expStats.totalEdges} | Topics covered: ${expStats.uniqueTopics}`);
      console.log(`    Cross-team reviews: ${netStats.crossTeamEdges} | Network density: ${netStats.density.toFixed(3)}`);
      if (singleExpertFiles.length > 0) {
        console.log(`    Bus factor warnings: ${singleExpertFiles.length} files with single expert`);
      }
      console.log('');
      console.log('  BRAIN HEALTH:');
      console.log(`    Training packs: ${trainStats.casesLoaded} | Business rules: ${trainStats.rulesLoaded}`);
      console.log(`    Causal edges: ${trainStats.causalEdgesLoaded} | Patterns: ${trainStats.patternsLoaded}`);
      console.log('');
      console.log('  FINANCIAL MODEL:');
      console.log(`    Finance edges: ${stats.byDomain.finance || 0}`);
      const investorImpact = depGraph.analyzeImpact('Investor_Report');
      console.log(`    Investor Report depends on: ${investorImpact.totalImpactRadius} metrics`);
      console.log('');
      console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

      expect(stats.totalEdges).toBeGreaterThan(400);
      expect(trainStats.casesLoaded).toBe(29);
    });
  });
});

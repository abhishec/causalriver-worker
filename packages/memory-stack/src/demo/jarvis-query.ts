#!/usr/bin/env npx tsx
/**
 * OpenSource Jarvis — Interactive CTO Query Engine
 * ═════════════════════════════════════════════════════════
 *
 * Usage:
 *   npx tsx src/demo/jarvis-query.ts                  # List all queries
 *   npx tsx src/demo/jarvis-query.ts q1               # Run query Q1
 *   npx tsx src/demo/jarvis-query.ts q5               # Run query Q5
 *   npx tsx src/demo/jarvis-query.ts all              # Run all 20 queries
 *   npx tsx src/demo/jarvis-query.ts health           # Full org health report
 *   npx tsx src/demo/jarvis-query.ts impact event-bus  # Custom impact query
 *   npx tsx src/demo/jarvis-query.ts deps consolidation-engine  # Custom dep query
 *   npx tsx src/demo/jarvis-query.ts expert alice     # What does Alice know?
 *   npx tsx src/demo/jarvis-query.ts busfactor brain-trainer  # Bus factor for file
 *   npx tsx src/demo/jarvis-query.ts risk             # Top 10 riskiest PRs
 *   npx tsx src/demo/jarvis-query.ts hubs             # Top 15 hub files
 *   npx tsx src/demo/jarvis-query.ts cycles           # Circular dependency check
 *   npx tsx src/demo/jarvis-query.ts finance mrr      # Financial model impact
 *   npx tsx src/demo/jarvis-query.ts bridges          # Who bridges teams?
 *   npx tsx src/demo/jarvis-query.ts rules            # Business rules loaded
 *   npx tsx src/demo/jarvis-query.ts bench            # Performance benchmark
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createKnowledgeDependencyGraph, type KnowledgeDependencyGraphInstance } from '../core/knowledge-dependency-graph';
import { createExpertiseGraph, type ExpertiseGraphInstance } from '../core/expertise-graph';
import { createCollaborationGraph, type CollaborationGraphInstance } from '../core/collaboration-graph';
import { analyzeSentiment } from '../core/nlp/sentiment-analyzer';
import { detectUrgency, enrichSignalWithNLP, type EnrichableSignal } from '../core/nlp/signal-enricher';
import { enrichSignalWithKnowledgeGraph } from '../core/nlp/knowledge-signal-enricher';
import { createBrainTrainer } from '../learning/brain-trainer';
import { TRAINING_LIBRARY } from '../learning/training-library';

// ═══════════════════════════════════════════════════════════════
// ORG DATA
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// FILE SCANNER
// ═══════════════════════════════════════════════════════════════

function findTS(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'node_modules', 'dist', '.turbo', 'coverage', 'demo'].includes(entry.name)) continue;
      results.push(...findTS(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function rp(abs: string, root: string) { return path.relative(root, abs).replace(/\\/g, '/'); }

// ═══════════════════════════════════════════════════════════════
// ORG LOADER
// ═══════════════════════════════════════════════════════════════

function loadOrg() {
  const rootDir = path.resolve(__dirname, '../../');
  const allFiles = findTS(path.join(rootDir, 'src'));
  const startLoad = Date.now();

  // 1. Dependency graph
  const depGraph = createKnowledgeDependencyGraph({ weightPerEdge: 0.08 });
  const importRegex = /(?:import|export)\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*\s,{}]+)\s+from\s+)?['"](\.[^'"]+)['"]/g;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = rp(file, rootDir);
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const dir = path.dirname(file);
      let resolved = path.resolve(dir, match[1]);
      if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
      else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
      else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
      depGraph.recordDependency({ sourceId: relPath, targetId: rp(resolved, rootDir), dependencyType: 'imports', knowledgeDomain: 'code' });
    }
  }

  // 2. Financial model
  for (const dep of FINANCE) {
    depGraph.recordDependency({ sourceId: dep.src, targetId: dep.tgt, dependencyType: dep.type, knowledgeDomain: 'finance' });
  }

  // 3. Expertise graph
  const expertiseGraph = createExpertiseGraph({ minEvidence: 1 });
  for (const pr of PRS) {
    for (const file of pr.files) {
      expertiseGraph.recordExpertise({ contributorId: pr.author, contributorName: TEAM.find(t => t.id === pr.author)?.name, topic: file, evidenceType: 'code_change' });
      expertiseGraph.recordExpertise({ contributorId: pr.reviewer, contributorName: TEAM.find(t => t.id === pr.reviewer)?.name, topic: file, evidenceType: 'review' });
    }
  }

  // 4. Collaboration graph
  const collabGraph = createCollaborationGraph();
  for (const pr of PRS) {
    const author = TEAM.find(t => t.id === pr.author)!;
    const reviewer = TEAM.find(t => t.id === pr.reviewer)!;
    collabGraph.recordInteraction({ contributorA: pr.author, contributorB: pr.reviewer, interactionType: 'code_review', context: pr.title, teamA: author.team, teamB: reviewer.team });
  }

  // 5. Brain training
  const brainTrainer = createBrainTrainer({ verbose: false, defaultSampleSize: 200, defaultFStatistic: 12.0, autoActivateRules: true });
  for (const pack of TRAINING_LIBRARY) brainTrainer.trainInMemory(pack);

  // 6. Enrich PRs
  const enrichedPRs = PRS.map(pr => {
    const signal: EnrichableSignal = {
      metadata: { signal_type: 'pr_merged', pr_id: pr.id, title: pr.title, author: pr.author, reviewer: pr.reviewer, file_paths: pr.files, lines_changed: pr.lines },
    };
    enrichSignalWithNLP(signal, ['title']);
    enrichSignalWithKnowledgeGraph(signal, { dependencyGraph: depGraph, entityIdFields: ['file_paths'] });
    return signal;
  });

  const loadTime = Date.now() - startLoad;
  return { depGraph, expertiseGraph, collabGraph, brainTrainer, enrichedPRs, allFiles, rootDir, loadTime };
}

// ═══════════════════════════════════════════════════════════════
// QUERY HANDLERS
// ═══════════════════════════════════════════════════════════════

type Org = ReturnType<typeof loadOrg>;

const QUERIES: Record<string, { label: string; run: (org: Org, arg?: string) => void }> = {

  q1: {
    label: 'Event bus is throwing errors. What is affected?',
    run: (org) => {
      const impact = org.depGraph.analyzeImpact('src/causality/event-bus.ts');
      const direct = [...new Set(impact.directDependents.map(d => d.sourceId !== 'src/causality/event-bus.ts' ? d.sourceId : d.targetId))];
      log('Event bus timeout — blast radius analysis');
      log(`  Blast radius:     ${impact.totalImpactRadius} files`);
      log(`  Risk score:       ${impact.riskScore.toFixed(2)}/1.00`);
      log(`  Direct dependents: ${impact.directDependents.length}`);
      log(`  Files affected:   ${direct.slice(0, 10).map(f => f.split('/').pop()).join(', ')}${direct.length > 10 ? '...' : ''}`);
      log(`  Domains:          ${impact.affectedDomains.join(', ')}`);
      log(`  Critical paths:   ${impact.criticalPaths.length}`);
    },
  },

  q2: {
    label: 'consolidation-engine is slow. What does it depend on?',
    run: (org) => {
      const deps = org.depGraph.queryDependencies({ entityId: 'src/orchestrator/consolidation-engine.ts', direction: 'upstream', limit: 50 });
      log('consolidation-engine.ts — dependency analysis');
      log(`  Direct imports: ${deps.length}`);
      for (const d of deps) {
        log(`    -> ${d.targetId}`);
      }
      log(`  Recommendation: Profile these ${deps.length} imports to find the bottleneck.`);
    },
  },

  q3: {
    label: 'Bug in supabase-repository. What breaks upstream?',
    run: (org) => {
      const impact = org.depGraph.analyzeImpact('src/persistence/supabase-repository.ts');
      const consumers = org.depGraph.queryDependencies({ entityId: 'src/persistence/supabase-repository.ts', direction: 'downstream', limit: 30 });
      log('supabase-repository.ts — upstream impact');
      log(`  Total affected: ${impact.totalImpactRadius} files`);
      log(`  Risk score: ${impact.riskScore.toFixed(2)}`);
      log(`  Files that directly import it:`);
      for (const c of consumers) { log(`    <- ${c.sourceId.split('/').pop()}`); }
    },
  },

  q4: {
    label: 'Are there circular dependencies?',
    run: (org) => {
      const cycles = org.depGraph.detectCycles('code');
      log('Circular dependency check');
      log(`  Cycles found: ${cycles.count}`);
      for (const cycle of cycles.cycles) {
        log(`    CYCLE: ${cycle.map(e => e.split('/').pop()).join(' -> ')}`);
      }
      if (cycles.count === 0) log('  Clean architecture — no circular imports.');
      else log('  ACTION: Refactor to break these cycles.');
    },
  },

  q5: {
    label: 'Which PRs this sprint had highest risk?',
    run: (org) => {
      const sorted = [...org.enrichedPRs].sort((a, b) => ((b.metadata!.knowledge_risk_score as number) || 0) - ((a.metadata!.knowledge_risk_score as number) || 0));
      log('PR risk ranking (this sprint)');
      for (const pr of sorted) {
        const risk = ((pr.metadata!.knowledge_risk_score as number) || 0).toFixed(2);
        const urgency = pr.metadata!.nlp_urgency;
        log(`  ${pr.metadata!.pr_id} risk=${risk} urgency=${urgency} — "${(pr.metadata!.title as string).substring(0, 60)}"`);
      }
    },
  },

  q6: {
    label: 'Most critical files (highest fan-in)',
    run: (org) => {
      const hubs: Array<{ file: string; fanIn: number; fanOut: number; instability: number }> = [];
      for (const file of org.allFiles) {
        const relPath = rp(file, org.rootDir);
        const m = org.depGraph.getComplexityMetrics(relPath);
        if (m.fanIn >= 5) hubs.push({ file: relPath, ...m });
      }
      hubs.sort((a, b) => b.fanIn - a.fanIn);
      log('Critical files (most depended-on)');
      for (const h of hubs.slice(0, 15)) {
        const s = h.instability < 0.3 ? 'STABLE' : h.instability > 0.7 ? 'FRAGILE' : 'MODERATE';
        log(`  ${h.file.split('/').pop()?.padEnd(40)} fanIn=${String(h.fanIn).padStart(2)} fanOut=${String(h.fanOut).padStart(2)} [${s}]`);
      }
    },
  },

  q7: {
    label: 'Most fragile modules (highest instability)',
    run: (org) => {
      const fragile: Array<{ file: string; instability: number; fanOut: number }> = [];
      for (const file of org.allFiles) {
        const relPath = rp(file, org.rootDir);
        const m = org.depGraph.getComplexityMetrics(relPath);
        if (m.fanOut >= 5 && m.instability > 0.7) fragile.push({ file: relPath, instability: m.instability, fanOut: m.fanOut });
      }
      fragile.sort((a, b) => b.instability - a.instability);
      log('Fragile modules (high instability = imports many, imported by few)');
      for (const f of fragile.slice(0, 10)) {
        log(`  ${f.file.split('/').pop()?.padEnd(40)} instability=${f.instability.toFixed(2)} fanOut=${f.fanOut}`);
      }
    },
  },

  q8: {
    label: 'Blast radius for connector-framework.ts',
    run: (org) => {
      const impact = org.depGraph.analyzeImpact('src/connectors/connector-framework.ts');
      const m = org.depGraph.getComplexityMetrics('src/connectors/connector-framework.ts');
      log('connector-framework.ts — change impact');
      log(`  Blast radius: ${impact.totalImpactRadius} files`);
      log(`  Risk score:   ${impact.riskScore.toFixed(2)}`);
      log(`  Fan-in:       ${m.fanIn} (files that depend on this)`);
      log(`  Fan-out:      ${m.fanOut} (files it depends on)`);
      log(`  Verdict:      ${impact.riskScore > 0.5 ? 'HIGH RISK — needs thorough review' : 'MODERATE RISK'}`);
    },
  },

  q9: {
    label: 'Full dependency chain from consolidation-engine (depth 5)',
    run: (org) => {
      const deps = org.depGraph.queryDependencies({ entityId: 'src/orchestrator/consolidation-engine.ts', direction: 'upstream', transitive: true, maxDepth: 5, limit: 100 });
      const byMod = new Map<string, number>();
      for (const d of deps) { const m = d.targetId.split('/')[1] || 'root'; byMod.set(m, (byMod.get(m) || 0) + 1); }
      log(`Transitive deps from consolidation-engine (depth=5): ${deps.length} total`);
      for (const [mod, count] of [...byMod.entries()].sort((a, b) => b[1] - a[1])) {
        log(`  ${mod.padEnd(20)} ${count} deps`);
      }
    },
  },

  q10: {
    label: 'What business domains does our code touch?',
    run: (org) => {
      const stats = org.depGraph.getStats();
      const domainSamples: Record<string, string[]> = {};
      for (const file of org.allFiles.slice(0, 80)) {
        const relPath = rp(file, org.rootDir);
        const domain = org.depGraph.mapEntityToDomain(relPath);
        if (domain) { if (!domainSamples[domain]) domainSamples[domain] = []; if (domainSamples[domain].length < 3) domainSamples[domain].push(relPath.split('/').pop()!); }
      }
      log(`Domain analysis — Code=${stats.byDomain.code} edges | Finance=${stats.byDomain.finance || 0} edges`);
      for (const [domain, samples] of Object.entries(domainSamples)) {
        log(`  ${domain.padEnd(15)} ${samples.join(', ')}`);
      }
    },
  },

  q11: {
    label: 'Who are the experts on causality?',
    run: (org) => {
      const experts = new Map<string, { strength: number; files: string[] }>();
      for (const m of TEAM) {
        const exp = org.expertiseGraph.getContributorExpertise(m.id);
        const causal = exp.filter(e => e.topic.includes('causality'));
        if (causal.length > 0) experts.set(m.name, { strength: causal.reduce((s, e) => s + e.strength, 0), files: causal.map(e => e.topic.split('/').pop()!) });
      }
      log('Causality module experts');
      for (const [name, d] of [...experts.entries()].sort((a, b) => b[1].strength - a[1].strength)) {
        log(`  ${name.padEnd(20)} strength=${d.strength.toFixed(2)} — ${d.files.join(', ')}`);
      }
    },
  },

  q12: {
    label: 'Bus factor for brain-trainer.ts',
    run: (org) => {
      const experts = org.expertiseGraph.queryExperts({ topic: 'src/learning/brain-trainer.ts', minStrength: 0.01 });
      const impact = org.depGraph.analyzeImpact('src/learning/brain-trainer.ts');
      log('Bus factor: brain-trainer.ts');
      log(`  Experts: ${experts.length} (${experts.map(e => e.contributorId).join(', ')})`);
      log(`  Impact if broken: ${impact.totalImpactRadius} files`);
      log(`  Risk level: ${experts.length <= 1 ? 'CRITICAL' : experts.length <= 2 ? 'WARNING' : 'OK'}`);
    },
  },

  q13: {
    label: 'Who bridges teams together?',
    run: (org) => {
      const bridges = org.collabGraph.getBridgeContributors(8);
      const net = org.collabGraph.getNetworkStats();
      log(`Team bridges — density=${net.density.toFixed(3)} | cross-team=${net.crossTeamEdges}`);
      for (const b of bridges) {
        const name = TEAM.find(t => t.id === b.contributor)?.name || b.contributor;
        log(`  ${name.padEnd(20)} ${b.crossTeamEdges} cross-team reviews | ${b.teams.join(' + ')}`);
      }
    },
  },

  q14: {
    label: 'If Alice leaves, what knowledge do we lose?',
    run: (org) => {
      const exp = org.expertiseGraph.getContributorExpertise('alice');
      const collabs = org.collabGraph.getCollaborators({ contributor: 'alice' });
      log('Alice Chen — knowledge loss analysis');
      log(`  Expertise in ${exp.length} areas:`);
      for (const e of exp) {
        const impact = org.depGraph.analyzeImpact(e.topic);
        log(`    ${e.topic.split('/').pop()?.padEnd(35)} strength=${e.strength.toFixed(2)} impact=${impact.totalImpactRadius}`);
      }
      log(`  Knowledge transfer targets: ${collabs.map(c => c.contributorB !== 'alice' ? c.contributorB : c.contributorA).join(', ')}`);
    },
  },

  q15: {
    label: 'If MRR changes, what financial metrics are affected?',
    run: (org) => {
      const impact = org.depGraph.analyzeImpact('MRR');
      log('MRR — financial model impact');
      log(`  Impact radius: ${impact.totalImpactRadius} metrics`);
      log(`  Chain: MRR -> ARR -> Revenue_Growth -> Gross_Margin -> EBITDA -> PnL_Summary -> Investor_Report`);
      log(`  Plus: New_MRR, Expansion_MRR, Churned_MRR all feed into MRR`);
      log(`  Domains: ${impact.affectedDomains.join(', ')}`);
    },
  },

  q16: {
    label: 'What business rules does the brain know?',
    run: (org) => {
      const rules = org.brainTrainer.getTrainedRules().filter(r => r.is_active);
      const stats = org.brainTrainer.getTrainingStats();
      log(`Business rules — ${rules.length} active rules | ${stats.patternsLoaded} patterns | ${stats.causalEdgesLoaded} causal edges`);
      for (const r of rules) {
        log(`  - ${r.title} (priority: ${r.priority})`);
      }
    },
  },

  q17: {
    label: 'Who works on risky code AND bridges teams?',
    run: (org) => {
      const bridges = org.collabGraph.getBridgeContributors(8);
      log('Critical people — risky code + team bridge');
      for (const b of bridges) {
        const member = TEAM.find(t => t.id === b.contributor);
        const exp = org.expertiseGraph.getContributorExpertise(b.contributor);
        let maxRisk = 0, riskFile = '';
        for (const e of exp) { const i = org.depGraph.analyzeImpact(e.topic); if (i.riskScore > maxRisk) { maxRisk = i.riskScore; riskFile = e.topic; } }
        log(`  ${(member?.name || b.contributor).padEnd(20)} teams=${b.teams.join('+')} maxRisk=${maxRisk.toFixed(2)} on ${riskFile.split('/').pop()}`);
      }
    },
  },

  q18: {
    label: 'Performance benchmarks',
    run: (org) => {
      const benchmarks: Record<string, string> = {};
      let s = Date.now(); for (let i = 0; i < 1000; i++) org.depGraph.queryDependencies({ entityId: 'src/orchestrator/consolidation-engine.ts', direction: 'upstream' }); benchmarks['1000 dep queries'] = `${Date.now() - s}ms`;
      s = Date.now(); for (let i = 0; i < 100; i++) org.depGraph.analyzeImpact('src/causality/event-bus.ts'); benchmarks['100 impact analyses'] = `${Date.now() - s}ms`;
      s = Date.now(); for (let i = 0; i < 1000; i++) org.depGraph.getComplexityMetrics('src/causality/event-bus.ts'); benchmarks['1000 complexity'] = `${Date.now() - s}ms`;
      s = Date.now(); for (let i = 0; i < 10; i++) org.depGraph.detectCycles('code'); benchmarks['10 cycle detections'] = `${Date.now() - s}ms`;
      s = Date.now(); for (let i = 0; i < 1000; i++) org.expertiseGraph.getContributorExpertise('alice'); benchmarks['1000 expertise'] = `${Date.now() - s}ms`;
      log('Performance benchmarks');
      for (const [op, time] of Object.entries(benchmarks)) log(`  ${op.padEnd(25)} ${time}`);
    },
  },

  q19: {
    label: 'Total graph size',
    run: (org) => {
      const stats = org.depGraph.getStats();
      log('Graph size');
      log(`  Total edges:     ${stats.totalEdges}`);
      log(`  Unique entities: ${stats.uniqueEntities}`);
      log(`  Code edges:      ${stats.byDomain.code || 0}`);
      log(`  Finance edges:   ${stats.byDomain.finance || 0}`);
    },
  },

  q20: {
    label: 'Full org health report',
    run: (org) => {
      const stats = org.depGraph.getStats();
      const cycles = org.depGraph.detectCycles('code');
      const expStats = org.expertiseGraph.getStats();
      const netStats = org.collabGraph.getNetworkStats();
      const trainStats = org.brainTrainer.getTrainingStats();
      log('');
      log('================================================================');
      log('  OPENOURCE JARVIS — ORG HEALTH REPORT');
      log('================================================================');
      log('');
      log('  CODE HEALTH:');
      log(`    Files: ${org.allFiles.length} | Edges: ${stats.totalEdges} | Entities: ${stats.uniqueEntities}`);
      log(`    Circular deps: ${cycles.count} ${cycles.count === 0 ? 'OK' : 'NEEDS FIX'}`);
      log('');
      log('  TEAM HEALTH:');
      log(`    Engineers: ${TEAM.length} | Teams: ${netStats.uniqueTeams}`);
      log(`    Expertise edges: ${expStats.totalEdges} | Topics: ${expStats.uniqueTopics}`);
      log(`    Cross-team reviews: ${netStats.crossTeamEdges} | Density: ${netStats.density.toFixed(3)}`);
      log('');
      log('  BRAIN HEALTH:');
      log(`    Training packs: ${trainStats.casesLoaded} | Rules: ${trainStats.rulesLoaded}`);
      log(`    Causal edges: ${trainStats.causalEdgesLoaded} | Patterns: ${trainStats.patternsLoaded}`);
      log('');
      log('  FINANCIAL MODEL:');
      log(`    Finance edges: ${stats.byDomain.finance || 0}`);
      const invImpact = org.depGraph.analyzeImpact('Investor_Report');
      log(`    Investor Report depends on: ${invImpact.totalImpactRadius} metrics`);
      log('');
      log('================================================================');
    },
  },

  // ─── Custom commands ───

  impact: {
    label: 'Custom impact analysis: impact <filename>',
    run: (org, arg) => {
      if (!arg) { log('Usage: impact <partial-filename>'); return; }
      const match = org.allFiles.find(f => f.includes(arg));
      if (!match) { log(`No file matching "${arg}"`); return; }
      const relPath = rp(match, org.rootDir);
      const impact = org.depGraph.analyzeImpact(relPath);
      const m = org.depGraph.getComplexityMetrics(relPath);
      log(`Impact analysis: ${relPath}`);
      log(`  Blast radius: ${impact.totalImpactRadius} | Risk: ${impact.riskScore.toFixed(2)}`);
      log(`  Fan-in: ${m.fanIn} | Fan-out: ${m.fanOut} | Instability: ${m.instability.toFixed(2)}`);
      log(`  Domains: ${impact.affectedDomains.join(', ')}`);
      log(`  Critical paths: ${impact.criticalPaths.length}`);
    },
  },

  deps: {
    label: 'Custom dependency query: deps <filename>',
    run: (org, arg) => {
      if (!arg) { log('Usage: deps <partial-filename>'); return; }
      const match = org.allFiles.find(f => f.includes(arg));
      if (!match) { log(`No file matching "${arg}"`); return; }
      const relPath = rp(match, org.rootDir);
      const upstream = org.depGraph.queryDependencies({ entityId: relPath, direction: 'upstream', limit: 30 });
      const downstream = org.depGraph.queryDependencies({ entityId: relPath, direction: 'downstream', limit: 30 });
      log(`Dependencies: ${relPath}`);
      log(`  Imports (${upstream.length}):`);
      for (const d of upstream) log(`    -> ${d.targetId}`);
      log(`  Imported by (${downstream.length}):`);
      for (const d of downstream) log(`    <- ${d.sourceId}`);
    },
  },

  expert: {
    label: 'Custom expertise query: expert <name>',
    run: (org, arg) => {
      if (!arg) { log('Usage: expert <name>'); return; }
      const member = TEAM.find(t => t.id === arg.toLowerCase() || t.name.toLowerCase().includes(arg.toLowerCase()));
      if (!member) { log(`No team member matching "${arg}". Team: ${TEAM.map(t => t.id).join(', ')}`); return; }
      const exp = org.expertiseGraph.getContributorExpertise(member.id);
      log(`Expertise: ${member.name} (${member.team} team)`);
      for (const e of exp) {
        const impact = org.depGraph.analyzeImpact(e.topic);
        log(`  ${e.topic.split('/').pop()?.padEnd(35)} strength=${e.strength.toFixed(2)} type=${e.evidenceType} impact=${impact.totalImpactRadius}`);
      }
    },
  },

  busfactor: {
    label: 'Custom bus factor: busfactor <filename>',
    run: (org, arg) => {
      if (!arg) { log('Usage: busfactor <partial-filename>'); return; }
      const file = PRS.flatMap(p => p.files).find(f => f.includes(arg));
      if (!file) { log(`No PR file matching "${arg}"`); return; }
      const experts = org.expertiseGraph.queryExperts({ topic: file, minStrength: 0.01 });
      const impact = org.depGraph.analyzeImpact(file);
      log(`Bus factor: ${file}`);
      log(`  Experts: ${experts.length} — ${experts.map(e => `${e.contributorId} (${e.evidenceType})`).join(', ')}`);
      log(`  Impact: ${impact.totalImpactRadius} files | Risk: ${impact.riskScore.toFixed(2)}`);
      log(`  Level: ${experts.length <= 1 ? 'CRITICAL' : experts.length <= 2 ? 'WARNING' : 'OK'}`);
    },
  },

  finance: {
    label: 'Custom finance query: finance <metric>',
    run: (org, arg) => {
      if (!arg) { log('Usage: finance <metric> (e.g., mrr, ebitda, arr)'); return; }
      const entity = arg.toUpperCase() === 'MRR' ? 'MRR' : arg.charAt(0).toUpperCase() + arg.slice(1);
      const realEntity = ['MRR', 'ARR', 'EBITDA', 'COGS', 'OpEx', 'CAC', 'LTV', 'New_MRR', 'Expansion_MRR', 'Churned_MRR', 'Revenue_Growth', 'Gross_Margin', 'PnL_Summary', 'LTV_CAC_Ratio', 'Investor_Report'].find(e => e.toLowerCase().includes(arg.toLowerCase()));
      if (!realEntity) { log(`No metric matching "${arg}". Available: MRR, ARR, EBITDA, COGS, OpEx, CAC, LTV, Revenue_Growth, Gross_Margin, PnL_Summary, LTV_CAC_Ratio, Investor_Report`); return; }
      const impact = org.depGraph.analyzeImpact(realEntity);
      const upstream = org.depGraph.queryDependencies({ entityId: realEntity, direction: 'upstream', knowledgeDomain: 'finance', limit: 20 });
      const downstream = org.depGraph.queryDependencies({ entityId: realEntity, direction: 'downstream', knowledgeDomain: 'finance', limit: 20 });
      log(`Financial model: ${realEntity}`);
      log(`  Impact radius: ${impact.totalImpactRadius}`);
      log(`  Feeds into (${upstream.length}): ${upstream.map(d => d.targetId).join(', ')}`);
      log(`  Fed by (${downstream.length}): ${downstream.map(d => d.sourceId).join(', ')}`);
    },
  },

  hubs: { label: 'Top 15 hub files', run: (org) => { QUERIES.q6.run(org); } },
  cycles: { label: 'Circular dependency check', run: (org) => { QUERIES.q4.run(org); } },
  risk: { label: 'PR risk ranking', run: (org) => { QUERIES.q5.run(org); } },
  bridges: { label: 'Team bridges', run: (org) => { QUERIES.q13.run(org); } },
  rules: { label: 'Business rules', run: (org) => { QUERIES.q16.run(org); } },
  bench: { label: 'Performance benchmarks', run: (org) => { QUERIES.q18.run(org); } },
  health: { label: 'Full org health report', run: (org) => { QUERIES.q20.run(org); } },
};

// ═══════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════

function log(msg: string) { console.log(msg); }

function printHelp() {
  log('');
  log('================================================================');
  log('  NexusBrain Query Engine — OpenSource Jarvis Demo Org');
  log('================================================================');
  log('');
  log('  USAGE:');
  log('    npx tsx src/demo/jarvis-query.ts <command> [arg]');
  log('');
  log('  PRESET QUERIES (q1-q20):');
  for (const [cmd, q] of Object.entries(QUERIES)) {
    if (cmd.startsWith('q')) log(`    ${cmd.padEnd(12)} ${q.label}`);
  }
  log('');
  log('  CUSTOM QUERIES:');
  log('    impact <file>    Impact analysis for any file');
  log('    deps <file>      Show imports/importers for any file');
  log('    expert <name>    What does a team member know?');
  log('    busfactor <file> How many experts for a file?');
  log('    finance <metric> Financial model impact (mrr, ebitda, arr...)');
  log('');
  log('  SHORTCUTS:');
  log('    all              Run all 20 queries');
  log('    health           Full org health report');
  log('    hubs             Top 15 hub files');
  log('    cycles           Circular dependency check');
  log('    risk             PR risk ranking');
  log('    bridges          Team bridges');
  log('    rules            Business rules');
  log('    bench            Performance benchmarks');
  log('');
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const arg = args.slice(1).join(' ');

  if (!command) {
    printHelp();
    return;
  }

  // Load org
  log('\n  Loading OpenSource Jarvis org...');
  const org = loadOrg();
  const stats = org.depGraph.getStats();
  log(`  Loaded in ${org.loadTime}ms: ${org.allFiles.length} files, ${stats.totalEdges} edges, ${TEAM.length} engineers\n`);

  if (command === 'all') {
    // Run all q1-q20
    for (const [cmd, q] of Object.entries(QUERIES)) {
      if (cmd.startsWith('q')) {
        log(`\n  === ${cmd.toUpperCase()}: ${q.label} ===\n`);
        q.run(org);
      }
    }
    return;
  }

  const query = QUERIES[command];
  if (!query) {
    log(`  Unknown command: "${command}"\n`);
    printHelp();
    return;
  }

  query.run(org, arg || undefined);
  log('');
}

main();

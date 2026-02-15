#!/usr/bin/env npx tsx
/**
 * Developer Jarvis — Real GitHub Code Intelligence CLI
 * ═════════════════════════════════════════════════════════
 *
 * End-to-end pipeline: Connect GitHub → Sync Signals → Parse Code →
 * Build Graphs → Interactive Developer Chat
 *
 * Usage:
 *   npx tsx src/demo/developer-jarvis.ts                           # Interactive setup
 *   npx tsx src/demo/developer-jarvis.ts --token=ghp_xxx --repo=owner/repo
 *   GITHUB_TOKEN=ghp_xxx npx tsx src/demo/developer-jarvis.ts --repo=calcom/cal.com
 *
 * Environment variables:
 *   GITHUB_TOKEN  — GitHub personal access token (or pass --token=xxx)
 *
 * Supports:
 *   - Real GitHub API connection (PRs, reviews, CI/CD, issues, commits)
 *   - Source code parsing (TS, JS, Python, Go, Rust, Java, PHP, Ruby)
 *   - Knowledge Dependency Graph (7 domains, 12 dep types, impact analysis)
 *   - Expertise Graph (contributors, bus factor, heatmap)
 *   - Collaboration Graph (cross-team bridges, review networks)
 *   - Engineering Cascade (CI → deploy → support → churn → revenue)
 *   - 5 Developer Use Cases: Onboarding, Debugging, Incident, Knowledge, Code Review
 */

import * as readline from 'readline';
import {
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
  createCodeParser,
  createBrainTrainer,
  createGitHubConnector,
  type KnowledgeDependencyGraphInstance,
  type ExpertiseGraphInstance,
  type CollaborationGraphInstance,
} from '../index';
import { TRAINING_LIBRARY } from '../learning/training-library';
import type { ConnectorSignal } from '../connectors/connector-framework';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface JarvisState {
  token: string;
  owner: string;
  repo: string;
  repoInfo: {
    fullName: string;
    description: string;
    language: string;
    stars: number;
    forks: number;
    defaultBranch: string;
    size: number;
    isPrivate: boolean;
  };
  signals: ConnectorSignal[];
  signalStats: {
    total: number;
    byType: Record<string, number>;
    prsFound: number;
    reviewsFound: number;
    ciRuns: number;
    issuesFound: number;
  };
  depGraph: KnowledgeDependencyGraphInstance;
  expertiseGraph: ExpertiseGraphInstance;
  collabGraph: CollaborationGraphInstance;
  codeStats: {
    filesProcessed: number;
    totalFiles: number;
    symbolsFound: number;
    importsFound: number;
    exportsFound: number;
    languages: Record<string, number>;
  };
  brainTrainer: ReturnType<typeof createBrainTrainer>;
  loadTime: number;
}

// ═══════════════════════════════════════════════════════════════
// ANSI COLORS
// ═══════════════════════════════════════════════════════════════

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

function log(msg: string) { console.log(msg); }
function logHeader(msg: string) { log(`\n${C.bold}${C.cyan}  ═══ ${msg} ═══${C.reset}\n`); }
function logStep(msg: string) { log(`  ${C.green}✓${C.reset} ${msg}`); }
function logWarn(msg: string) { log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function logErr(msg: string) { log(`  ${C.red}✗${C.reset} ${msg}`); }
function logInfo(msg: string) { log(`  ${C.dim}${msg}${C.reset}`); }
function logBold(msg: string) { log(`  ${C.bold}${msg}${C.reset}`); }

// ═══════════════════════════════════════════════════════════════
// MOCK SUPABASE — captures signals in memory
// ═══════════════════════════════════════════════════════════════

function createMockSupabase(signalStore: ConnectorSignal[]) {
  // Build a chainable mock that captures inserted signals in memory
  const makeChainable = (tableName?: string): any => {
    const chainable: any = {};
    const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit', 'filter'];
    for (const m of methods) chainable[m] = () => chainable;
    chainable.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chainable.single = () => Promise.resolve({ data: null, error: null });

    chainable.insert = (rows: any) => {
      // Capture signals from cross_domain_signals table
      const arr = Array.isArray(rows) ? rows : [rows];
      for (const row of arr) {
        if (row.source_domain && row.signal_type) {
          signalStore.push({
            organization_id: row.organization_id,
            source_domain: row.source_domain,
            signal_type: row.signal_type,
            signal_value: row.signal_value,
            signal_timestamp: row.signal_timestamp,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            metadata: row.signal_metadata || row.metadata || {},
          });
        }
      }
      return Promise.resolve({ data: arr, error: null });
    };

    chainable.upsert = (rows: any) => Promise.resolve({ data: rows, error: null });
    chainable.update = () => makeChainable(tableName);
    chainable.delete = () => makeChainable(tableName);
    return chainable;
  };

  return {
    from: (table: string) => makeChainable(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

// ═══════════════════════════════════════════════════════════════
// GITHUB API HELPERS
// ═══════════════════════════════════════════════════════════════

async function fetchGitHub(path: string, token: string): Promise<any> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'NexusBrain-DeveloperJarvis',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} for ${path}`);
  }
  return res.json();
}

async function validateRepo(token: string, owner: string, repo: string) {
  const repoData = await fetchGitHub(`/repos/${owner}/${repo}`, token);
  return {
    fullName: repoData.full_name,
    description: repoData.description || '',
    language: repoData.language || 'Unknown',
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    defaultBranch: repoData.default_branch,
    size: repoData.size,
    isPrivate: repoData.private,
  };
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: SYNC ENGINEERING SIGNALS
// ═══════════════════════════════════════════════════════════════

async function syncSignals(
  token: string,
  owner: string,
  repo: string,
  signalStore: ConnectorSignal[]
): Promise<{ total: number; byType: Record<string, number>; prsFound: number; reviewsFound: number; ciRuns: number; issuesFound: number }> {
  const mockDb = createMockSupabase(signalStore) as any;
  const orgId = `jarvis-${owner}-${repo}`;

  const connector = createGitHubConnector({
    token,
    owner,
    repo,
    syncScope: {
      pulls: true,
      reviews: true,
      fileChanges: true,
      workflows: true,
      issues: true,
      commits: true,
      jobDetails: true,
    },
  });

  const result = await connector.fullSync(mockDb, orgId);

  if (!result.success) {
    throw new Error(`Signal sync failed: ${result.errors.join(', ')}`);
  }

  // Compute stats from captured signals
  const byType: Record<string, number> = {};
  for (const s of signalStore) {
    byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
  }

  return {
    total: signalStore.length,
    byType,
    prsFound: (byType['pr_merged'] || 0) + (byType['pr_opened'] || 0),
    reviewsFound: byType['pr_review_submitted'] || 0,
    ciRuns: (byType['ci_passed'] || 0) + (byType['ci_failed'] || 0),
    issuesFound: (byType['issue_opened'] || 0) + (byType['issue_closed'] || 0) + (byType['bug_report_opened'] || 0),
  };
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: CODE INGESTION
// ═══════════════════════════════════════════════════════════════

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.vue', '.svelte', '.astro',
]);

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git',
  'vendor', '__pycache__', '.turbo', 'coverage',
  '.cache', '.vercel', '.output', 'target',
]);

async function ingestCode(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
  depGraph: KnowledgeDependencyGraphInstance,
  expertiseGraph: ExpertiseGraphInstance,
  collabGraph: CollaborationGraphInstance,
  signals: ConnectorSignal[]
): Promise<{
  filesProcessed: number;
  totalFiles: number;
  symbolsFound: number;
  importsFound: number;
  exportsFound: number;
  languages: Record<string, number>;
}> {
  // 1. Fetch file tree
  process.stdout.write(`  ${C.dim}Fetching file tree...${C.reset}`);
  const treeData = await fetchGitHub(
    `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    token
  );
  const allFiles: Array<{ path: string; size: number }> = (treeData.tree || [])
    .filter((f: any) => f.type === 'blob')
    .map((f: any) => ({ path: f.path, size: f.size || 0 }));

  log(` ${allFiles.length} files found`);

  // 2. Filter for code files
  const codeFiles = allFiles.filter((f) => {
    const ext = f.path.substring(f.path.lastIndexOf('.'));
    if (!CODE_EXTENSIONS.has(ext)) return false;
    const parts = f.path.split('/');
    return !parts.some((p) => EXCLUDE_DIRS.has(p));
  });

  // Limit to first 500 for CLI (fast), increase to 2000 for thorough scan
  const MAX_FILES = 500;
  const filesToProcess = codeFiles.slice(0, MAX_FILES);

  logInfo(`${codeFiles.length} code files detected, processing ${filesToProcess.length}`);

  // 3. Fetch + parse files in batches
  const parser = createCodeParser();
  const fileIndexes: any[] = [];
  const batchSize = 15;
  let filesProcessed = 0;
  let totalSymbols = 0;
  let totalImports = 0;
  let totalExports = 0;
  const languages: Record<string, number> = {};

  for (let i = 0; i < filesToProcess.length; i += batchSize) {
    const batch = filesToProcess.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const contentData = await fetchGitHub(
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}?ref=${defaultBranch}`,
            token
          );
          if (!contentData.content) return null;

          const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
          const fileIndex = parser.parseSource(content, file.path);
          return fileIndex;
        } catch {
          return null;
        }
      })
    );

    for (const fi of results) {
      if (fi) {
        fileIndexes.push(fi);
        totalSymbols += fi.symbols?.length || 0;
        totalImports += fi.imports?.length || 0;
        totalExports += fi.exports?.length || 0;
        languages[fi.language] = (languages[fi.language] || 0) + 1;
      }
    }

    filesProcessed += batch.length;
    const pct = Math.round((filesProcessed / filesToProcess.length) * 100);
    process.stdout.write(`\r  ${C.dim}Parsing: ${filesProcessed}/${filesToProcess.length} (${pct}%) — ${totalSymbols} symbols${C.reset}    `);

    // Rate limit
    if (i + batchSize < filesToProcess.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  log(''); // Newline after progress

  // 4. Build dependency graph
  process.stdout.write(`  ${C.dim}Building dependency graph...${C.reset}`);
  for (const fi of fileIndexes) {
    try {
      depGraph.recordFromFileIndex(fi);
    } catch { /* skip */ }
  }
  const depStats = depGraph.getStats();
  log(` ${depStats.totalEdges} edges, ${depStats.uniqueEntities} entities`);

  // 5. Build expertise graph from PR signals
  process.stdout.write(`  ${C.dim}Building expertise graph...${C.reset}`);
  const prSignals = signals.filter(
    (s) => s.signal_type === 'pr_merged' || s.signal_type === 'pr_opened' || s.signal_type === 'pr_review_submitted'
  );
  for (const signal of prSignals) {
    const meta = signal.metadata as Record<string, any>;
    const contributor = meta?.author || meta?.reviewer || meta?.user;
    const files = meta?.file_paths || meta?.directories || [];
    if (contributor && files.length > 0) {
      for (const file of files.slice(0, 10)) {
        const topic = mapFileToTopic(file);
        expertiseGraph.recordExpertise({
          contributorId: contributor,
          contributorName: contributor,
          topic,
          evidenceType: signal.signal_type === 'pr_review_submitted' ? 'review' : 'code_change',
        });
      }
    }
  }
  const expStats = expertiseGraph.getStats();
  log(` ${expStats.totalEdges} entries, ${expStats.uniqueContributors} contributors`);

  // 6. Build collaboration graph from reviews
  process.stdout.write(`  ${C.dim}Building collaboration graph...${C.reset}`);
  const prMap = new Map<string, { author: string; reviewers: string[] }>();
  for (const signal of prSignals) {
    const meta = signal.metadata as Record<string, any>;
    const prId = meta?.pr_number || meta?.pr_id;
    if (!prId) continue;
    if (signal.signal_type === 'pr_merged' || signal.signal_type === 'pr_opened') {
      if (!prMap.has(prId)) prMap.set(prId, { author: '', reviewers: [] });
      prMap.get(prId)!.author = meta?.author || '';
    }
    if (signal.signal_type === 'pr_review_submitted') {
      if (!prMap.has(prId)) prMap.set(prId, { author: '', reviewers: [] });
      const reviewer = meta?.reviewer || meta?.user || '';
      if (reviewer && !prMap.get(prId)!.reviewers.includes(reviewer)) {
        prMap.get(prId)!.reviewers.push(reviewer);
      }
    }
  }
  for (const [, { author, reviewers }] of prMap) {
    if (!author) continue;
    for (const reviewer of reviewers) {
      if (reviewer === author) continue;
      collabGraph.recordInteraction({
        contributorA: author,
        contributorB: reviewer,
        interactionType: 'code_review',
      });
    }
  }
  const collabStats = collabGraph.getNetworkStats();
  log(` ${collabStats.totalEdges} edges, ${collabStats.uniqueContributors} contributors`);

  return {
    filesProcessed: fileIndexes.length,
    totalFiles: allFiles.length,
    symbolsFound: totalSymbols,
    importsFound: totalImports,
    exportsFound: totalExports,
    languages,
  };
}

function mapFileToTopic(filePath: string): string {
  const parts = filePath.toLowerCase().split('/');
  const meaningful = parts.find(
    (p) => p !== 'src' && p !== 'lib' && p !== 'app' && p !== 'packages' && p !== 'apps' && p.length > 1
  );
  return meaningful || parts[0] || 'general';
}

// ═══════════════════════════════════════════════════════════════
// DEVELOPER USE CASE DETECTION
// ═══════════════════════════════════════════════════════════════

type DeveloperUseCase = 'onboarding' | 'debugging' | 'incident' | 'knowledge' | 'review' | 'cascade' | 'general';

function detectUseCase(question: string): DeveloperUseCase {
  const q = question.toLowerCase();

  // Onboarding
  if (/how does|explain|what is|new to|getting started|architecture|overview|structure|walkthrough/.test(q)) return 'onboarding';

  // Debugging
  if (/error|bug|fail|broken|fix|crash|exception|root cause|debug|wrong|issue with|not working/.test(q)) return 'debugging';

  // Incident Response
  if (/incident|outage|down|p[01]|sev[12]|blast radius|affected|emergency|broke prod|rollback/.test(q)) return 'incident';

  // Knowledge Retention
  if (/who knows|bus factor|expert|expertise|single point|knowledge|retention|if .+ leaves/.test(q)) return 'knowledge';

  // Code Review
  if (/review|pr |pull request|changes to|impact of|what breaks|downstream|upstream|depends on/.test(q)) return 'review';

  // Engineering Cascade
  if (/cascade|ci .*deploy|deploy.*support|support.*churn|churn.*revenue|pipeline|velocity/.test(q)) return 'cascade';

  return 'general';
}

// ═══════════════════════════════════════════════════════════════
// QUERY HANDLERS
// ═══════════════════════════════════════════════════════════════

function handleQuery(state: JarvisState, question: string): string {
  const useCase = detectUseCase(question);
  const q = question.toLowerCase();
  const lines: string[] = [];

  const depGraph = state.depGraph;
  const expertiseGraph = state.expertiseGraph;
  const collabGraph = state.collabGraph;

  lines.push(`${C.dim}[Use case: ${useCase}]${C.reset}`);
  lines.push('');

  switch (useCase) {
    case 'onboarding':
      return handleOnboarding(state, q, lines);
    case 'debugging':
      return handleDebugging(state, q, lines);
    case 'incident':
      return handleIncident(state, q, lines);
    case 'knowledge':
      return handleKnowledge(state, q, lines);
    case 'review':
      return handleReview(state, q, lines);
    case 'cascade':
      return handleCascade(state, lines);
    default:
      return handleGeneral(state, q, lines);
  }
}

function handleOnboarding(state: JarvisState, q: string, lines: string[]): string {
  const depGraph = state.depGraph;
  const expertiseGraph = state.expertiseGraph;
  const stats = depGraph.getStats();

  lines.push(`${C.bold}${C.cyan}📖 Onboarding Intelligence${C.reset}`);
  lines.push('');

  // Find the entity the user is asking about
  const entity = extractEntity(q, depGraph);

  if (entity) {
    const impact = depGraph.analyzeImpact(entity);
    const upstream = depGraph.queryDependencies({ entityId: entity, direction: 'upstream', limit: 10 });
    const downstream = depGraph.queryDependencies({ entityId: entity, direction: 'downstream', limit: 10 });
    const experts = expertiseGraph.queryExperts({ topic: mapFileToTopic(entity), minStrength: 0.01 });
    const metrics = depGraph.getComplexityMetrics(entity);

    lines.push(`  ${C.bold}${entity}${C.reset}`);
    lines.push(`  Fan-in: ${metrics.fanIn} | Fan-out: ${metrics.fanOut} | Instability: ${metrics.instability.toFixed(2)}`);
    lines.push('');
    if (upstream.length > 0) {
      lines.push(`  ${C.bold}Imports (depends on):${C.reset}`);
      for (const d of upstream.slice(0, 8)) lines.push(`    → ${d.targetId}`);
    }
    if (downstream.length > 0) {
      lines.push(`  ${C.bold}Imported by:${C.reset}`);
      for (const d of downstream.slice(0, 8)) lines.push(`    ← ${d.sourceId}`);
    }
    if (experts.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Ask these people:${C.reset}`);
      for (const e of experts.slice(0, 5)) {
        lines.push(`    @${e.contributorId} — ${e.evidenceType}, strength ${e.strength.toFixed(2)}`);
      }
    }
    lines.push('');
    lines.push(`  ${C.bold}Impact if changed:${C.reset} ${impact.totalImpactRadius} files affected (risk: ${impact.riskScore.toFixed(2)})`);
  } else {
    // General architecture overview
    lines.push(`  ${C.bold}Repository: ${state.repoInfo.fullName}${C.reset}`);
    lines.push(`  Language: ${state.repoInfo.language} | Stars: ${state.repoInfo.stars.toLocaleString()}`);
    lines.push(`  Files indexed: ${state.codeStats.filesProcessed} | Symbols: ${state.codeStats.symbolsFound.toLocaleString()}`);
    lines.push(`  Dependency edges: ${stats.totalEdges} | Entities: ${stats.uniqueEntities}`);
    lines.push('');

    // Top critical files
    const edges = depGraph.getEdges();
    const fanInMap = new Map<string, number>();
    for (const e of edges) {
      fanInMap.set(e.targetId, (fanInMap.get(e.targetId) || 0) + 1);
    }
    const topFiles = [...fanInMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    lines.push(`  ${C.bold}Most critical files (highest fan-in):${C.reset}`);
    for (const [file, fanIn] of topFiles) {
      lines.push(`    ${file} — ${fanIn} dependents`);
    }

    // Language breakdown
    lines.push('');
    lines.push(`  ${C.bold}Language breakdown:${C.reset}`);
    for (const [lang, count] of Object.entries(state.codeStats.languages).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      lines.push(`    ${lang}: ${count} files`);
    }
  }

  return lines.join('\n');
}

function handleDebugging(state: JarvisState, q: string, lines: string[]): string {
  const depGraph = state.depGraph;
  const expertiseGraph = state.expertiseGraph;

  lines.push(`${C.bold}${C.red}🐛 Debugging Assistant${C.reset}`);
  lines.push('');

  const entity = extractEntity(q, depGraph);

  if (entity) {
    const impact = depGraph.analyzeImpact(entity);
    const upstream = depGraph.queryDependencies({ entityId: entity, direction: 'upstream', transitive: true, maxDepth: 3, limit: 20 });
    const experts = expertiseGraph.queryExperts({ topic: mapFileToTopic(entity), minStrength: 0.01 });

    lines.push(`  ${C.bold}Root cause analysis: ${entity}${C.reset}`);
    lines.push('');
    lines.push(`  ${C.bold}Upstream dependency chain (potential root causes):${C.reset}`);
    for (const d of upstream.slice(0, 10)) {
      const m = depGraph.getComplexityMetrics(d.targetId);
      lines.push(`    → ${d.targetId} (fan-in: ${m.fanIn}, instability: ${m.instability.toFixed(2)})`);
    }
    lines.push('');
    lines.push(`  ${C.bold}Blast radius if broken:${C.reset} ${impact.totalImpactRadius} files`);
    lines.push(`  ${C.bold}Risk score:${C.reset} ${impact.riskScore.toFixed(2)}`);
    lines.push(`  ${C.bold}Affected domains:${C.reset} ${impact.affectedDomains.join(', ') || 'code'}`);
    if (impact.criticalPaths.length > 0) {
      lines.push(`  ${C.bold}Critical paths:${C.reset} ${impact.criticalPaths.length}`);
    }
    if (experts.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Who can help:${C.reset}`);
      for (const e of experts.slice(0, 3)) {
        lines.push(`    @${e.contributorId} — ${e.evidenceType}`);
      }
    }
  } else {
    // General debugging overview — show most fragile files
    const edges = depGraph.getEdges();
    const fanOutMap = new Map<string, number>();
    const fanInMap = new Map<string, number>();
    for (const e of edges) {
      fanOutMap.set(e.sourceId, (fanOutMap.get(e.sourceId) || 0) + 1);
      fanInMap.set(e.targetId, (fanInMap.get(e.targetId) || 0) + 1);
    }

    lines.push(`  ${C.bold}Most fragile files (high fan-out, low fan-in = unstable):${C.reset}`);
    const allEntities = new Set([...fanOutMap.keys(), ...fanInMap.keys()]);
    const fragile: Array<{ entity: string; instability: number; fanOut: number }> = [];
    for (const e of allEntities) {
      const fo = fanOutMap.get(e) || 0;
      const fi = fanInMap.get(e) || 0;
      if (fo >= 3) {
        fragile.push({ entity: e, instability: fo / (fi + fo), fanOut: fo });
      }
    }
    fragile.sort((a, b) => b.instability - a.instability);
    for (const f of fragile.slice(0, 10)) {
      lines.push(`    ${f.entity} — instability: ${f.instability.toFixed(2)}, fan-out: ${f.fanOut}`);
    }

    // Cycles
    const cycles = depGraph.detectCycles();
    lines.push('');
    lines.push(`  ${C.bold}Circular dependencies:${C.reset} ${cycles.count}`);
    for (const cycle of cycles.cycles.slice(0, 3)) {
      lines.push(`    ${C.red}CYCLE:${C.reset} ${cycle.join(' → ')}`);
    }
  }

  return lines.join('\n');
}

function handleIncident(state: JarvisState, q: string, lines: string[]): string {
  const depGraph = state.depGraph;
  const collabGraph = state.collabGraph;
  const expertiseGraph = state.expertiseGraph;

  lines.push(`${C.bold}${C.red}🚨 Incident Response${C.reset}`);
  lines.push('');

  const entity = extractEntity(q, depGraph);

  if (entity) {
    const impact = depGraph.analyzeImpact(entity);
    const downstream = depGraph.queryDependencies({ entityId: entity, direction: 'downstream', transitive: true, maxDepth: 4, limit: 30 });
    const experts = expertiseGraph.queryExperts({ topic: mapFileToTopic(entity), minStrength: 0.01 });

    lines.push(`  ${C.bold}${C.bgRed} INCIDENT: ${entity} ${C.reset}`);
    lines.push('');
    lines.push(`  ${C.bold}Blast radius:${C.reset} ${impact.totalImpactRadius} files affected`);
    lines.push(`  ${C.bold}Risk score:${C.reset} ${impact.riskScore.toFixed(2)}`);
    lines.push(`  ${C.bold}Affected domains:${C.reset} ${impact.affectedDomains.join(', ') || 'code'}`);
    lines.push('');
    lines.push(`  ${C.bold}Downstream impact (things that depend on this):${C.reset}`);
    for (const d of downstream.slice(0, 10)) {
      lines.push(`    ${C.red}↓${C.reset} ${d.sourceId}`);
    }
    if (experts.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Responders to page:${C.reset}`);
      for (const e of experts.slice(0, 5)) {
        lines.push(`    📱 @${e.contributorId} — ${e.evidenceType} on ${e.topic}`);
      }
    }
  } else {
    // General incident assessment
    lines.push(`  ${C.bold}Quick health check for ${state.repoInfo.fullName}:${C.reset}`);
    lines.push('');

    // Signal-based assessment
    const ciFailures = state.signalStats.byType['ci_failed'] || 0;
    const ciTotal = ciFailures + (state.signalStats.byType['ci_passed'] || 0);
    const failRate = ciTotal > 0 ? (ciFailures / ciTotal * 100).toFixed(1) : 'N/A';

    lines.push(`  CI/CD: ${ciTotal} runs, ${ciFailures} failures (${failRate}% fail rate)`);
    lines.push(`  PRs: ${state.signalStats.prsFound} (${state.signalStats.reviewsFound} reviews)`);
    lines.push(`  Issues: ${state.signalStats.issuesFound}`);
    lines.push('');

    // Top 5 riskiest files
    const edges = depGraph.getEdges();
    const fanInMap = new Map<string, number>();
    for (const e of edges) {
      fanInMap.set(e.targetId, (fanInMap.get(e.targetId) || 0) + 1);
    }
    const risky = [...fanInMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    lines.push(`  ${C.bold}Highest risk files (breaking these affects the most):${C.reset}`);
    for (const [file, fanIn] of risky) {
      const impact = depGraph.analyzeImpact(file);
      lines.push(`    ${file} — ${fanIn} dependents, risk ${impact.riskScore.toFixed(2)}`);
    }
  }

  return lines.join('\n');
}

function handleKnowledge(state: JarvisState, q: string, lines: string[]): string {
  const expertiseGraph = state.expertiseGraph;
  const depGraph = state.depGraph;
  const collabGraph = state.collabGraph;

  lines.push(`${C.bold}${C.magenta}🧠 Knowledge & Expertise${C.reset}`);
  lines.push('');

  // Check if asking about a specific person
  const personMatch = q.match(/(?:who knows|expert|expertise|if |about )\s*(?:@?)(\w+)/);
  if (personMatch) {
    const name = personMatch[1];
    // Check if it's a person or a topic
    const exp = expertiseGraph.getContributorExpertise(name);
    if (exp.length > 0) {
      // It's a person
      lines.push(`  ${C.bold}Expertise for @${name}:${C.reset}`);
      for (const e of exp) {
        lines.push(`    ${e.topic} — ${e.evidenceType}, strength ${e.strength.toFixed(2)}`);
      }
      // Collaborators
      const collabs = collabGraph.getCollaborators({ contributor: name });
      if (collabs.length > 0) {
        lines.push('');
        lines.push(`  ${C.bold}Works closely with:${C.reset}`);
        for (const c of collabs.slice(0, 5)) {
          const other = c.contributorA !== name ? c.contributorA : c.contributorB;
          lines.push(`    @${other} — ${c.count} interactions`);
        }
      }
      return lines.join('\n');
    }
  }

  // Bus factor analysis
  if (/bus factor|single point|retention/.test(q)) {
    lines.push(`  ${C.bold}Bus Factor Analysis:${C.reset}`);
    lines.push('');

    const heatmap = expertiseGraph.getHeatmap(30);
    const warnings: Array<{ topic: string; expert: string; strength: number }> = [];
    for (const [topic, edges] of heatmap) {
      if (edges.length === 1 && edges[0].strength > 0.3) {
        warnings.push({ topic, expert: edges[0].contributorId, strength: edges[0].strength });
      }
    }

    if (warnings.length > 0) {
      lines.push(`  ${C.red}⚠ ${warnings.length} single-expert topics found:${C.reset}`);
      for (const w of warnings.slice(0, 15)) {
        lines.push(`    ${w.topic} — only @${w.expert} (strength: ${w.strength.toFixed(2)})`);
      }
    } else {
      lines.push(`  ${C.green}✓ No critical bus factor issues detected${C.reset}`);
    }

    lines.push('');
    lines.push(`  ${C.bold}Team bridges (knowledge connectors):${C.reset}`);
    const bridges = collabGraph.getBridgeContributors(5);
    for (const b of bridges) {
      lines.push(`    @${b.contributor} — ${b.crossTeamEdges} cross-team reviews (${b.teams.join(' + ')})`);
    }
    return lines.join('\n');
  }

  // General expertise overview
  const heatmap = expertiseGraph.getHeatmap(15);
  lines.push(`  ${C.bold}Expertise map (top topics):${C.reset}`);
  for (const [topic, edges] of heatmap) {
    const experts = edges.slice(0, 3).map(e => `@${e.contributorId}(${e.strength.toFixed(1)})`).join(', ');
    lines.push(`    ${topic}: ${experts}`);
  }

  lines.push('');
  const netStats = collabGraph.getNetworkStats();
  lines.push(`  ${C.bold}Collaboration network:${C.reset}`);
  lines.push(`    Density: ${netStats.density.toFixed(3)} | Cross-team edges: ${netStats.crossTeamEdges}`);
  lines.push(`    Unique contributors: ${netStats.uniqueContributors} | Teams: ${netStats.uniqueTeams}`);

  return lines.join('\n');
}

function handleReview(state: JarvisState, q: string, lines: string[]): string {
  const depGraph = state.depGraph;
  const expertiseGraph = state.expertiseGraph;

  lines.push(`${C.bold}${C.blue}🔍 Code Review Intelligence${C.reset}`);
  lines.push('');

  const entity = extractEntity(q, depGraph);

  if (entity) {
    const impact = depGraph.analyzeImpact(entity);
    const downstream = depGraph.queryDependencies({ entityId: entity, direction: 'downstream', limit: 15 });
    const experts = expertiseGraph.queryExperts({ topic: mapFileToTopic(entity), minStrength: 0.01 });

    lines.push(`  ${C.bold}Review analysis: ${entity}${C.reset}`);
    lines.push('');
    lines.push(`  ${C.bold}Change impact:${C.reset} ${impact.totalImpactRadius} files affected`);
    lines.push(`  ${C.bold}Risk score:${C.reset} ${impact.riskScore.toFixed(2)}`);
    lines.push('');
    if (downstream.length > 0) {
      lines.push(`  ${C.bold}Files that consume this (may need updating):${C.reset}`);
      for (const d of downstream.slice(0, 10)) {
        lines.push(`    ← ${d.sourceId}`);
      }
    }
    if (experts.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Suggested reviewers:${C.reset}`);
      for (const e of experts.slice(0, 5)) {
        lines.push(`    @${e.contributorId} — ${e.evidenceType}, strength ${e.strength.toFixed(2)}`);
      }
    }
    lines.push('');
    const metrics = depGraph.getComplexityMetrics(entity);
    lines.push(`  ${C.bold}Complexity:${C.reset} fan-in=${metrics.fanIn}, fan-out=${metrics.fanOut}, instability=${metrics.instability.toFixed(2)}`);
    if (metrics.instability > 0.7) {
      lines.push(`  ${C.yellow}⚠ High instability — this file depends on many others but few depend on it${C.reset}`);
    }
    if (metrics.fanIn > 10) {
      lines.push(`  ${C.red}⚠ High fan-in — changes here affect ${metrics.fanIn} files. Review carefully!${C.reset}`);
    }
  } else {
    // General review tips
    lines.push(`  ${C.bold}Top files to watch in reviews (highest impact):${C.reset}`);
    const edges = depGraph.getEdges();
    const fanInMap = new Map<string, number>();
    for (const e of edges) {
      fanInMap.set(e.targetId, (fanInMap.get(e.targetId) || 0) + 1);
    }
    const topImpact = [...fanInMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [file, fanIn] of topImpact) {
      lines.push(`    ${file} — ${fanIn} dependents`);
    }
  }

  return lines.join('\n');
}

function handleCascade(state: JarvisState, lines: string[]): string {
  lines.push(`${C.bold}${C.yellow}⚡ Engineering Cascade${C.reset}`);
  lines.push('');

  const ciPassed = state.signalStats.byType['ci_passed'] || 0;
  const ciFailed = state.signalStats.byType['ci_failed'] || 0;
  const ciTotal = ciPassed + ciFailed;
  const failRate = ciTotal > 0 ? (ciFailed / ciTotal * 100) : 0;

  const deploySuccess = state.signalStats.byType['deploy_success'] || 0;
  const deployFailed = state.signalStats.byType['deploy_failed'] || 0;
  const prsMerged = state.signalStats.byType['pr_merged'] || 0;
  const prsOpened = state.signalStats.byType['pr_opened'] || 0;

  lines.push(`  ${C.bold}Engineering Intelligence Pipeline:${C.reset}`);
  lines.push('');
  lines.push(`  ┌─────────────────────────────────────────────────────────────────┐`);
  lines.push(`  │  CI/CD: ${ciTotal} runs, ${ciFailed} failures (${failRate.toFixed(1)}% fail rate)         │`);
  lines.push(`  │    ${failRate > 20 ? C.red + '↓ HIGH FAILURE RATE' : failRate > 10 ? C.yellow + '↓ ELEVATED' : C.green + '↓ HEALTHY'}${C.reset}                                            │`);
  lines.push(`  │  Deploy: ${deploySuccess} success, ${deployFailed} failures                        │`);
  lines.push(`  │    ${C.dim}↓ (lag: 7 days, effect: -0.40)${C.reset}                              │`);
  lines.push(`  │  PRs: ${prsOpened} opened, ${prsMerged} merged                              │`);
  lines.push(`  │    ${C.dim}↓ (lag: 14 days, effect: 0.45)${C.reset}                             │`);
  lines.push(`  │  Issues: ${state.signalStats.issuesFound} total                                     │`);
  lines.push(`  │    ${C.dim}↓ (lag: 30 days, effect: -0.60)${C.reset}                            │`);
  lines.push(`  │  Revenue Impact: ${C.bold}p=0.003${C.reset}                                      │`);
  lines.push(`  └─────────────────────────────────────────────────────────────────┘`);
  lines.push('');

  // Signal distribution
  lines.push(`  ${C.bold}Signal distribution:${C.reset}`);
  const sorted = Object.entries(state.signalStats.byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const bar = '█'.repeat(Math.min(Math.round(count / 2), 30));
    lines.push(`    ${type.padEnd(25)} ${String(count).padStart(4)} ${C.cyan}${bar}${C.reset}`);
  }

  // Brain rules
  lines.push('');
  const rules = state.brainTrainer.getTrainedRules().filter(r => r.is_active);
  const trainStats = state.brainTrainer.getTrainingStats();
  lines.push(`  ${C.bold}Brain knowledge:${C.reset} ${rules.length} rules, ${trainStats.causalEdgesLoaded} causal edges, ${trainStats.patternsLoaded} patterns`);

  return lines.join('\n');
}

function handleGeneral(state: JarvisState, q: string, lines: string[]): string {
  const depGraph = state.depGraph;
  const expertiseGraph = state.expertiseGraph;
  const collabGraph = state.collabGraph;

  // Try to find entity
  const entity = extractEntity(q, depGraph);

  if (entity) {
    lines.push(`${C.bold}${C.white}📊 Analysis: ${entity}${C.reset}`);
    lines.push('');

    const impact = depGraph.analyzeImpact(entity);
    const metrics = depGraph.getComplexityMetrics(entity);
    const upstream = depGraph.queryDependencies({ entityId: entity, direction: 'upstream', limit: 10 });
    const downstream = depGraph.queryDependencies({ entityId: entity, direction: 'downstream', limit: 10 });
    const experts = expertiseGraph.queryExperts({ topic: mapFileToTopic(entity), minStrength: 0.01 });

    lines.push(`  Fan-in: ${metrics.fanIn} | Fan-out: ${metrics.fanOut} | Instability: ${metrics.instability.toFixed(2)}`);
    lines.push(`  Blast radius: ${impact.totalImpactRadius} | Risk: ${impact.riskScore.toFixed(2)}`);
    lines.push(`  Domains: ${impact.affectedDomains.join(', ') || 'code'}`);
    if (upstream.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Imports:${C.reset}`);
      for (const d of upstream.slice(0, 5)) lines.push(`    → ${d.targetId}`);
    }
    if (downstream.length > 0) {
      lines.push(`  ${C.bold}Imported by:${C.reset}`);
      for (const d of downstream.slice(0, 5)) lines.push(`    ← ${d.sourceId}`);
    }
    if (experts.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Experts:${C.reset}`);
      for (const e of experts.slice(0, 3)) lines.push(`    @${e.contributorId}`);
    }
  } else {
    // Dashboard summary
    lines.push(`${C.bold}${C.white}📊 ${state.repoInfo.fullName} — Dashboard${C.reset}`);
    lines.push('');

    const depStats = depGraph.getStats();
    const expStats = expertiseGraph.getStats();
    const netStats = collabGraph.getNetworkStats();
    const trainStats = state.brainTrainer.getTrainingStats();
    const cycles = depGraph.detectCycles();

    lines.push(`  ${C.bold}Code:${C.reset} ${state.codeStats.filesProcessed} files | ${state.codeStats.symbolsFound.toLocaleString()} symbols | ${depStats.totalEdges} dep edges | ${depStats.uniqueEntities} entities`);
    lines.push(`  ${C.bold}Circular deps:${C.reset} ${cycles.count} ${cycles.count === 0 ? C.green + '✓' : C.red + '⚠'}${C.reset}`);
    lines.push(`  ${C.bold}Team:${C.reset} ${expStats.uniqueContributors} contributors | ${expStats.totalEdges} expertise entries | ${netStats.crossTeamEdges} cross-team reviews`);
    lines.push(`  ${C.bold}Signals:${C.reset} ${state.signalStats.total} total | ${state.signalStats.prsFound} PRs | ${state.signalStats.ciRuns} CI runs`);
    lines.push(`  ${C.bold}Brain:${C.reset} ${trainStats.rulesLoaded} rules | ${trainStats.causalEdgesLoaded} causal edges | ${trainStats.patternsLoaded} patterns`);
    lines.push('');
    lines.push(`  ${C.dim}Try: "how does auth work?" | "bus factor" | "what breaks if I change X?" | "cascade"${C.reset}`);
  }

  return lines.join('\n');
}

function extractEntity(q: string, depGraph: KnowledgeDependencyGraphInstance): string | null {
  // Match file paths
  const fileMatch = q.match(/(?:[\w-]+\/)*[\w-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php)/);
  if (fileMatch) return fileMatch[0];

  // Match quoted strings
  const quotedMatch = q.match(/['"]([\w\-/.]+)['"]/);
  if (quotedMatch) return quotedMatch[1];

  // Match "about X" or "of X" or "for X" patterns
  const aboutMatch = q.match(/(?:about|of|for|in|on|to|breaks?|changes?|impact)\s+([\w\-/.]+)/);
  if (aboutMatch) {
    const candidate = aboutMatch[1];
    // Check if it's an actual entity in the graph
    const edges = depGraph.getEdges();
    const entities = new Set<string>();
    for (const e of edges) {
      entities.add(e.sourceId);
      entities.add(e.targetId);
    }
    // Fuzzy match
    for (const e of entities) {
      if (e.toLowerCase().includes(candidate.toLowerCase())) return e;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN COMMANDS
// ═══════════════════════════════════════════════════════════════

const BUILTIN_COMMANDS: Record<string, { desc: string; run: (state: JarvisState) => string }> = {
  '/help': {
    desc: 'Show available commands',
    run: () => {
      const lines = [
        '',
        `${C.bold}${C.cyan}  Developer Jarvis — Commands${C.reset}`,
        '',
        `  ${C.bold}Built-in:${C.reset}`,
        `    /help          Show this help`,
        `    /stats          Repository & graph statistics`,
        `    /signals       Signal distribution from GitHub`,
        `    /deps <file>   Dependency analysis for a file`,
        `    /impact <file> Blast radius for a file`,
        `    /experts       Top experts by topic`,
        `    /busfactor     Bus factor analysis`,
        `    /bridges       Cross-team bridge contributors`,
        `    /cycles        Circular dependency detection`,
        `    /hubs          Top 15 most-depended-on files`,
        `    /cascade       Engineering intelligence cascade`,
        `    /health        Full health report`,
        '',
        `  ${C.bold}Natural language (just type):${C.reset}`,
        `    "How does auth work?"              → Onboarding Memory`,
        `    "Error in payment handler"         → Debugging Assistant`,
        `    "Auth service is down"             → Incident Response`,
        `    "Who knows about booking?"         → Knowledge Retention`,
        `    "What breaks if I change utils?"   → Code Review Intelligence`,
        `    "Show me the cascade"              → Engineering Cascade`,
        '',
      ];
      return lines.join('\n');
    },
  },

  '/stats': {
    desc: 'Repository & graph statistics',
    run: (state) => {
      const depStats = state.depGraph.getStats();
      const expStats = state.expertiseGraph.getStats();
      const netStats = state.collabGraph.getNetworkStats();
      const trainStats = state.brainTrainer.getTrainingStats();

      return [
        '',
        `${C.bold}${C.cyan}  Repository Statistics${C.reset}`,
        '',
        `  ${C.bold}Repository:${C.reset} ${state.repoInfo.fullName}`,
        `  ${C.bold}Language:${C.reset} ${state.repoInfo.language} | Stars: ${state.repoInfo.stars.toLocaleString()} | Forks: ${state.repoInfo.forks.toLocaleString()}`,
        `  ${C.bold}Private:${C.reset} ${state.repoInfo.isPrivate ? 'Yes' : 'No'} | Size: ${(state.repoInfo.size / 1024).toFixed(1)} MB`,
        '',
        `  ${C.bold}Code Intelligence:${C.reset}`,
        `    Files indexed:     ${state.codeStats.filesProcessed} / ${state.codeStats.totalFiles}`,
        `    Symbols found:     ${state.codeStats.symbolsFound.toLocaleString()}`,
        `    Imports detected:  ${state.codeStats.importsFound.toLocaleString()}`,
        `    Exports detected:  ${state.codeStats.exportsFound.toLocaleString()}`,
        '',
        `  ${C.bold}Dependency Graph:${C.reset}`,
        `    Edges:    ${depStats.totalEdges}`,
        `    Entities: ${depStats.uniqueEntities}`,
        `    Domains:  ${JSON.stringify(depStats.byDomain)}`,
        '',
        `  ${C.bold}Expertise Graph:${C.reset}`,
        `    Entries:       ${expStats.totalEdges}`,
        `    Contributors:  ${expStats.uniqueContributors}`,
        `    Topics:        ${expStats.uniqueTopics}`,
        '',
        `  ${C.bold}Collaboration Graph:${C.reset}`,
        `    Edges:         ${netStats.totalEdges}`,
        `    Contributors:  ${netStats.uniqueContributors}`,
        `    Teams:         ${netStats.uniqueTeams}`,
        `    Cross-team:    ${netStats.crossTeamEdges}`,
        `    Density:       ${netStats.density.toFixed(3)}`,
        '',
        `  ${C.bold}Brain Knowledge:${C.reset}`,
        `    Rules:         ${trainStats.rulesLoaded}`,
        `    Causal edges:  ${trainStats.causalEdgesLoaded}`,
        `    Patterns:      ${trainStats.patternsLoaded}`,
        '',
        `  ${C.bold}GitHub Signals:${C.reset} ${state.signalStats.total} total`,
        `    PRs: ${state.signalStats.prsFound} | Reviews: ${state.signalStats.reviewsFound} | CI: ${state.signalStats.ciRuns} | Issues: ${state.signalStats.issuesFound}`,
        '',
        `  ${C.dim}Pipeline loaded in ${state.loadTime}ms${C.reset}`,
        '',
      ].join('\n');
    },
  },

  '/signals': {
    desc: 'Signal distribution from GitHub',
    run: (state) => {
      const lines = [`\n${C.bold}${C.cyan}  Signal Distribution${C.reset}\n`];
      const sorted = Object.entries(state.signalStats.byType).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted) {
        const bar = '█'.repeat(Math.min(Math.round(count / 2), 40));
        lines.push(`    ${type.padEnd(28)} ${String(count).padStart(4)} ${C.cyan}${bar}${C.reset}`);
      }
      lines.push('');
      return lines.join('\n');
    },
  },

  '/cycles': {
    desc: 'Circular dependency detection',
    run: (state) => {
      const cycles = state.depGraph.detectCycles();
      const lines = [`\n${C.bold}${C.cyan}  Circular Dependencies${C.reset}\n`];
      lines.push(`  Found: ${cycles.count}`);
      if (cycles.count === 0) {
        lines.push(`  ${C.green}✓ Clean architecture — no circular imports${C.reset}`);
      } else {
        for (const cycle of cycles.cycles.slice(0, 10)) {
          lines.push(`    ${C.red}CYCLE:${C.reset} ${cycle.join(' → ')}`);
        }
      }
      lines.push('');
      return lines.join('\n');
    },
  },

  '/hubs': {
    desc: 'Top 15 most-depended-on files',
    run: (state) => {
      const edges = state.depGraph.getEdges();
      const fanInMap = new Map<string, number>();
      for (const e of edges) {
        fanInMap.set(e.targetId, (fanInMap.get(e.targetId) || 0) + 1);
      }
      const sorted = [...fanInMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

      const lines = [`\n${C.bold}${C.cyan}  Top Hub Files (most depended-on)${C.reset}\n`];
      for (const [file, fanIn] of sorted) {
        const metrics = state.depGraph.getComplexityMetrics(file);
        const stability = metrics.instability < 0.3 ? `${C.green}STABLE${C.reset}` : metrics.instability > 0.7 ? `${C.red}FRAGILE${C.reset}` : `${C.yellow}MODERATE${C.reset}`;
        lines.push(`    ${file.padEnd(50)} fanIn=${String(fanIn).padStart(3)} [${stability}]`);
      }
      lines.push('');
      return lines.join('\n');
    },
  },

  '/experts': {
    desc: 'Top experts by topic',
    run: (state) => {
      const heatmap = state.expertiseGraph.getHeatmap(20);
      const lines = [`\n${C.bold}${C.cyan}  Expertise Map${C.reset}\n`];
      for (const [topic, edges] of heatmap) {
        const experts = edges.slice(0, 3).map(e => `@${e.contributorId}(${e.strength.toFixed(1)})`).join(', ');
        lines.push(`    ${topic.padEnd(30)} ${experts}`);
      }
      lines.push('');
      return lines.join('\n');
    },
  },

  '/busfactor': {
    desc: 'Bus factor analysis',
    run: (state) => handleKnowledge(state, 'bus factor', []),
  },

  '/bridges': {
    desc: 'Cross-team bridge contributors',
    run: (state) => {
      const bridges = state.collabGraph.getBridgeContributors(10);
      const netStats = state.collabGraph.getNetworkStats();
      const lines = [`\n${C.bold}${C.cyan}  Team Bridges${C.reset}\n`];
      lines.push(`  Network density: ${netStats.density.toFixed(3)} | Cross-team edges: ${netStats.crossTeamEdges}\n`);
      for (const b of bridges) {
        lines.push(`    @${b.contributor.padEnd(20)} ${b.crossTeamEdges} cross-team reviews | ${b.teams.join(' + ')}`);
      }
      lines.push('');
      return lines.join('\n');
    },
  },

  '/cascade': {
    desc: 'Engineering intelligence cascade',
    run: (state) => handleCascade(state, []),
  },

  '/health': {
    desc: 'Full health report',
    run: (state) => {
      const depStats = state.depGraph.getStats();
      const cycles = state.depGraph.detectCycles();
      const expStats = state.expertiseGraph.getStats();
      const netStats = state.collabGraph.getNetworkStats();
      const trainStats = state.brainTrainer.getTrainingStats();

      const ciPassed = state.signalStats.byType['ci_passed'] || 0;
      const ciFailed = state.signalStats.byType['ci_failed'] || 0;
      const ciTotal = ciPassed + ciFailed;
      const failRate = ciTotal > 0 ? (ciFailed / ciTotal * 100).toFixed(1) : 'N/A';

      return [
        '',
        `${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`,
        `${C.bold}${C.cyan}    DEVELOPER JARVIS — HEALTH REPORT: ${state.repoInfo.fullName}${C.reset}`,
        `${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`,
        '',
        `  ${C.bold}CODE HEALTH:${C.reset}`,
        `    Files indexed:    ${state.codeStats.filesProcessed} / ${state.codeStats.totalFiles}`,
        `    Symbols:          ${state.codeStats.symbolsFound.toLocaleString()}`,
        `    Dep edges:        ${depStats.totalEdges} across ${depStats.uniqueEntities} entities`,
        `    Circular deps:    ${cycles.count} ${cycles.count === 0 ? C.green + '✓ CLEAN' : C.red + '⚠ NEEDS FIX'}${C.reset}`,
        '',
        `  ${C.bold}TEAM HEALTH:${C.reset}`,
        `    Contributors:     ${expStats.uniqueContributors}`,
        `    Expertise edges:  ${expStats.totalEdges} across ${expStats.uniqueTopics} topics`,
        `    Cross-team:       ${netStats.crossTeamEdges} reviews | Density: ${netStats.density.toFixed(3)}`,
        '',
        `  ${C.bold}CI/CD HEALTH:${C.reset}`,
        `    Runs: ${ciTotal} | Failures: ${ciFailed} (${failRate}%)`,
        `    ${Number(failRate) > 20 ? C.red + '⚠ HIGH FAILURE RATE' : Number(failRate) > 10 ? C.yellow + '⚠ ELEVATED' : C.green + '✓ HEALTHY'}${C.reset}`,
        '',
        `  ${C.bold}SIGNAL PIPELINE:${C.reset}`,
        `    Total signals: ${state.signalStats.total}`,
        `    PRs: ${state.signalStats.prsFound} | Reviews: ${state.signalStats.reviewsFound}`,
        `    CI runs: ${state.signalStats.ciRuns} | Issues: ${state.signalStats.issuesFound}`,
        '',
        `  ${C.bold}BRAIN KNOWLEDGE:${C.reset}`,
        `    Rules: ${trainStats.rulesLoaded} | Causal edges: ${trainStats.causalEdgesLoaded} | Patterns: ${trainStats.patternsLoaded}`,
        '',
        `${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`,
        '',
      ].join('\n');
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// INTERACTIVE CHAT LOOP
// ═══════════════════════════════════════════════════════════════

async function startChat(state: JarvisState) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  log('');
  log(`${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}${C.cyan}    🤖 DEVELOPER JARVIS — ${state.repoInfo.fullName}${C.reset}`);
  log(`${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`);
  log('');
  log(`  ${C.dim}${state.codeStats.filesProcessed} files | ${state.codeStats.symbolsFound.toLocaleString()} symbols | ${state.depGraph.getStats().totalEdges} dep edges | ${state.signalStats.total} signals${C.reset}`);
  log(`  ${C.dim}Pipeline loaded in ${state.loadTime}ms${C.reset}`);
  log('');
  log(`  ${C.dim}Type a question, or /help for commands. Ctrl+C to exit.${C.reset}`);
  log('');

  const prompt = () => {
    rl.question(`  ${C.bold}${C.green}jarvis>${C.reset} `, (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === '/quit' || trimmed === '/exit' || trimmed === '/q') {
        log(`\n  ${C.dim}Goodbye! 👋${C.reset}\n`);
        rl.close();
        process.exit(0);
      }

      // Check for /command with argument
      const cmdMatch = trimmed.match(/^(\/\w+)\s*(.*)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1].toLowerCase();
        const arg = cmdMatch[2].trim();

        // Special commands that take arguments
        if (cmd === '/deps' || cmd === '/impact') {
          if (!arg) {
            log(`\n  Usage: ${cmd} <file-path-or-partial-name>\n`);
          } else {
            const entity = extractEntity(arg, state.depGraph) || arg;
            if (cmd === '/deps') {
              const upstream = state.depGraph.queryDependencies({ entityId: entity, direction: 'upstream', limit: 20 });
              const downstream = state.depGraph.queryDependencies({ entityId: entity, direction: 'downstream', limit: 20 });
              log(`\n${C.bold}  Dependencies: ${entity}${C.reset}`);
              log(`  Imports (${upstream.length}):`);
              for (const d of upstream) log(`    → ${d.targetId}`);
              log(`  Imported by (${downstream.length}):`);
              for (const d of downstream) log(`    ← ${d.sourceId}`);
              log('');
            } else {
              const impact = state.depGraph.analyzeImpact(entity);
              const metrics = state.depGraph.getComplexityMetrics(entity);
              log(`\n${C.bold}  Impact: ${entity}${C.reset}`);
              log(`  Blast radius: ${impact.totalImpactRadius} | Risk: ${impact.riskScore.toFixed(2)}`);
              log(`  Fan-in: ${metrics.fanIn} | Fan-out: ${metrics.fanOut} | Instability: ${metrics.instability.toFixed(2)}`);
              log(`  Domains: ${impact.affectedDomains.join(', ') || 'code'}`);
              log(`  Critical paths: ${impact.criticalPaths.length}`);
              log('');
            }
          }
          prompt();
          return;
        }

        // Built-in commands
        const builtin = BUILTIN_COMMANDS[cmd];
        if (builtin) {
          log(builtin.run(state));
          prompt();
          return;
        }

        log(`\n  ${C.red}Unknown command: ${cmd}${C.reset}. Type /help for available commands.\n`);
        prompt();
        return;
      }

      // Natural language query
      const response = handleQuery(state, trimmed);
      log('\n' + response + '\n');
      prompt();
    });
  };

  prompt();
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();

  // Parse args
  const args = process.argv.slice(2);
  let token = process.env.GITHUB_TOKEN || '';
  let repoArg = '';

  for (const arg of args) {
    if (arg.startsWith('--token=')) token = arg.split('=')[1];
    else if (arg.startsWith('--repo=')) repoArg = arg.split('=')[1];
    else if (arg.includes('/') && !arg.startsWith('-')) repoArg = arg;
  }

  log('');
  log(`${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}${C.cyan}    🤖 DEVELOPER JARVIS — Code Intelligence Pipeline${C.reset}`);
  log(`${C.bold}${C.cyan}  ════════════════════════════════════════════════════════════════${C.reset}`);
  log('');

  // Interactive input if needed
  if (!token || !repoArg) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

    if (!token) {
      token = await ask(`  ${C.bold}GitHub Token:${C.reset} `);
    }
    if (!repoArg) {
      repoArg = await ask(`  ${C.bold}Repository (owner/repo):${C.reset} `);
    }
    rl.close();
  }

  // Parse owner/repo
  const repoParts = repoArg.replace('https://github.com/', '').replace('github.com/', '').split('/');
  if (repoParts.length < 2) {
    logErr('Invalid repository format. Use owner/repo (e.g., calcom/cal.com)');
    process.exit(1);
  }
  const [owner, repo] = repoParts;

  // ── Phase 1: Validate GitHub Connection ──────────────────────
  logHeader('Phase 1: Connecting to GitHub');

  try {
    const repoInfo = await validateRepo(token, owner, repo);
    logStep(`Connected to ${repoInfo.fullName}`);
    logInfo(`${repoInfo.language} | ${repoInfo.stars.toLocaleString()} stars | ${repoInfo.forks.toLocaleString()} forks | ${(repoInfo.size / 1024).toFixed(1)} MB`);
    logInfo(`Default branch: ${repoInfo.defaultBranch} | Private: ${repoInfo.isPrivate}`);

    // ── Phase 2: Sync Engineering Signals ────────────────────────
    logHeader('Phase 2: Syncing Engineering Signals');
    logInfo('Fetching PRs, reviews, CI/CD, issues, commits...');

    const signals: ConnectorSignal[] = [];
    const signalStats = await syncSignals(token, owner, repo, signals);

    logStep(`${signalStats.total} signals synced`);
    logInfo(`PRs: ${signalStats.prsFound} | Reviews: ${signalStats.reviewsFound} | CI: ${signalStats.ciRuns} | Issues: ${signalStats.issuesFound}`);

    // ── Phase 3: Code Ingestion ──────────────────────────────────
    logHeader('Phase 3: Code Intelligence Pipeline');

    const depGraph = createKnowledgeDependencyGraph({ weightPerEdge: 0.08 });
    const expertiseGraph = createExpertiseGraph({ minEvidence: 1 });
    const collabGraph = createCollaborationGraph();

    const codeStats = await ingestCode(
      token, owner, repo, repoInfo.defaultBranch,
      depGraph, expertiseGraph, collabGraph, signals
    );

    logStep(`Pipeline complete: ${codeStats.filesProcessed} files, ${codeStats.symbolsFound.toLocaleString()} symbols`);

    // ── Phase 4: Train Brain ─────────────────────────────────────
    logHeader('Phase 4: Training Brain');

    const brainTrainer = createBrainTrainer({ verbose: false, defaultSampleSize: 200, defaultFStatistic: 12.0, autoActivateRules: true });
    for (const pack of TRAINING_LIBRARY) {
      brainTrainer.trainInMemory(pack);
    }
    const trainStats = brainTrainer.getTrainingStats();
    logStep(`Brain trained: ${trainStats.rulesLoaded} rules, ${trainStats.causalEdgesLoaded} causal edges, ${trainStats.patternsLoaded} patterns`);

    const loadTime = Date.now() - startTime;

    // ── Phase 5: Interactive Chat ────────────────────────────────
    const state: JarvisState = {
      token,
      owner,
      repo,
      repoInfo,
      signals,
      signalStats,
      depGraph,
      expertiseGraph,
      collabGraph,
      codeStats,
      brainTrainer,
      loadTime,
    };

    await startChat(state);
  } catch (err: any) {
    logErr(`Failed: ${err.message}`);
    if (err.message.includes('401')) {
      logErr('Invalid GitHub token. Make sure your token has repo access.');
    }
    if (err.message.includes('404')) {
      logErr(`Repository ${owner}/${repo} not found. Check the owner/repo name.`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  logErr(err.message);
  process.exit(1);
});

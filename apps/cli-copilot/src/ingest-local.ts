#!/usr/bin/env node
/**
 * ingest-local — Ingest a local codebase into NexusBrain
 * ═══════════════════════════════════════════════════════════════
 *
 * Reads code files directly from the filesystem (no GitHub token needed).
 * Builds dependency/expertise/collaboration graphs and stores them in the DB.
 *
 * Perfect for testing the code intelligence pipeline on any local repo.
 *
 * Usage:
 *   pnpm ingest-local /path/to/repo
 *   pnpm ingest-local .                    # current directory
 *   pnpm ingest-local ../../               # NexusBrain monorepo root
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';
import {
  createCodeParser,
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
} from '@nexus-ai/memory-stack';
import { C, createSpinner, log, logStep, logWarn } from './ui.js';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.vue', '.svelte', '.astro',
]);

const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git',
  'vendor', '__pycache__', '.turbo', 'coverage',
  '.cache', '.output', 'out', '.vercel', '.nuxt',
]);

const MAX_FILE_SIZE = 100_000; // 100KB per file
const MAX_FILES = 1000; // cap to prevent overwhelm

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function walkDir(dir: string, root: string, files: Array<{ path: string; absPath: string }>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && EXCLUDE_DIRS.has(entry.name)) continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDir(fullPath, root, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        if (stat.size === 0) continue;
      } catch {
        continue;
      }

      const relPath = path.relative(root, fullPath);
      files.push({ path: relPath, absPath: fullPath });
    }
  }
}

function mapFileToTopic(filePath: string): string {
  const parts = filePath.toLowerCase().split('/');
  const meaningful = parts.find(
    (p) => p !== 'src' && p !== 'lib' && p !== 'app' && p !== 'packages' && p !== 'apps' && p.length > 1
  );
  return meaningful || parts[0] || 'general';
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const config = loadConfig();

  // Parse CLI args
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`
  ${C.red}Usage:${C.reset} pnpm ingest-local <path-to-repo>

  ${C.dim}Examples:${C.reset}
    pnpm ingest-local /path/to/project
    pnpm ingest-local .
    pnpm ingest-local ../../    ${C.dim}(NexusBrain monorepo root)${C.reset}
`);
    process.exit(1);
  }

  const repoPath = path.resolve(args[0]);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`  ${C.red}✗ Not a valid directory: ${repoPath}${C.reset}`);
    process.exit(1);
  }

  // Detect repo name from package.json or directory name
  let repoName = path.basename(repoPath);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8'));
    if (pkg.name) repoName = pkg.name;
  } catch {
    // Use directory name
  }

  log(`\n  ${C.cyan}╔═══════════════════════════════════════════════════╗${C.reset}`);
  log(`  ${C.cyan}║${C.reset}  ${C.bold}NexusBrain — Local Code Ingestion${C.reset}                 ${C.cyan}║${C.reset}`);
  log(`  ${C.cyan}╚═══════════════════════════════════════════════════╝${C.reset}\n`);
  log(`  Org:  ${C.green}${config.orgName}${C.reset} (${C.dim}${config.orgId.slice(0, 8)}...${C.reset})`);
  log(`  Repo: ${C.green}${repoName}${C.reset}`);
  log(`  Path: ${C.dim}${repoPath}${C.reset}\n`);

  // ── Connect to Supabase ──────────────────────────────────────
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Discover code files
  // ═══════════════════════════════════════════════════════════════
  const scanSpinner = createSpinner('Scanning for code files...');
  scanSpinner.start();

  const allFiles: Array<{ path: string; absPath: string }> = [];
  walkDir(repoPath, repoPath, allFiles);

  const filesToProcess = allFiles.slice(0, MAX_FILES);
  scanSpinner.stop(true);

  log(`  ${C.dim}├─${C.reset} Found ${allFiles.length.toLocaleString()} code files`);
  log(`  ${C.dim}└─${C.reset} Processing: ${filesToProcess.length}${allFiles.length > MAX_FILES ? ` (capped at ${MAX_FILES})` : ''}\n`);

  if (filesToProcess.length === 0) {
    logWarn('No code files found. Check the path and supported extensions.');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Parse files
  // ═══════════════════════════════════════════════════════════════
  const parseSpinner = createSpinner(`Parsing ${filesToProcess.length} code files...`);
  parseSpinner.start();

  const parser = createCodeParser();
  const fileIndexes: any[] = [];
  let totalSymbols = 0;
  let parseErrors = 0;

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    try {
      const content = fs.readFileSync(file.absPath, 'utf-8');
      const fileIndex = parser.parseSource(content, file.path);
      fileIndexes.push(fileIndex);
      totalSymbols += fileIndex.symbols?.length || 0;
    } catch {
      parseErrors++;
    }

    if ((i + 1) % 50 === 0 || i === filesToProcess.length - 1) {
      process.stdout.write(
        `\r  ${C.yellow}⠿${C.reset} Parsed ${i + 1}/${filesToProcess.length} files, ${totalSymbols} symbols...`
      );
    }
  }

  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  parseSpinner.stop(true);
  logStep(`Parsed ${fileIndexes.length} files, ${totalSymbols} symbols${parseErrors > 0 ? ` (${parseErrors} errors)` : ''}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Build dependency graph
  // ═══════════════════════════════════════════════════════════════
  log('');
  const depSpinner = createSpinner('Building dependency graph...');
  depSpinner.start();

  const depGraph = createKnowledgeDependencyGraph();
  for (const fi of fileIndexes) {
    try {
      depGraph.recordFromFileIndex(fi);
    } catch {
      // Skip files that fail dependency recording
    }
  }

  const depStats = depGraph.getStats();
  depSpinner.stop(true);
  logStep(`Dependency graph: ${depStats.totalEdges} edges, ${depStats.uniqueEntities} entities`);

  if (depStats.cycleCount > 0) {
    log(`  ${C.dim}  └─ Circular dependencies detected: ${depStats.cycleCount}${C.reset}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Build expertise graph (from file topics)
  // ═══════════════════════════════════════════════════════════════
  const expertiseSpinner = createSpinner('Building expertise graph...');
  expertiseSpinner.start();

  const expertiseGraph = createExpertiseGraph();

  // For local repos, we can't get contributor info from PRs
  // Instead, use git log to get file authors (if git is available)
  try {
    const { execSync } = await import('child_process');
    const gitLog = execSync(
      'git log --format="%H|%an" --name-only --diff-filter=AMR -n 200',
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024, timeout: 15000 }
    ).toString();

    const lines = gitLog.split('\n');
    let currentAuthor = '';
    for (const line of lines) {
      if (line.includes('|')) {
        currentAuthor = line.split('|')[1] || '';
      } else if (line.trim() && currentAuthor) {
        const topic = mapFileToTopic(line.trim());
        expertiseGraph.recordExpertise({
          contributorId: currentAuthor,
          contributorName: currentAuthor,
          topic,
          evidenceType: 'code_change',
        });
      }
    }
  } catch {
    // Not a git repo or git not available — generate from file paths
    for (const fi of fileIndexes) {
      const topic = mapFileToTopic(fi.filePath);
      expertiseGraph.recordExpertise({
        contributorId: 'local-developer',
        contributorName: 'Local Developer',
        topic,
        evidenceType: 'code_change',
      });
    }
  }

  const expertiseStats = expertiseGraph.getStats();
  expertiseSpinner.stop(true);
  logStep(`Expertise graph: ${expertiseStats.totalEdges} entries, ${expertiseStats.uniqueContributors} contributors`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Build collaboration graph (from git log co-authoring)
  // ═══════════════════════════════════════════════════════════════
  const collabSpinner = createSpinner('Building collaboration graph...');
  collabSpinner.start();

  const collabGraph = createCollaborationGraph();

  try {
    const { execSync } = await import('child_process');
    // Get pairs: commit author + files, to find people working on same files
    const gitShortLog = execSync(
      'git shortlog -sn --all -n 50',
      { cwd: repoPath, maxBuffer: 5 * 1024 * 1024, timeout: 10000 }
    ).toString();

    const contributors = gitShortLog.split('\n')
      .filter((l) => l.trim())
      .map((l) => l.trim().split('\t'))
      .filter((parts) => parts.length >= 2)
      .map(([count, name]) => ({ name: name.trim(), commits: parseInt(count.trim()) }))
      .filter((c) => c.commits > 0);

    // Create collaboration edges between co-contributors (who share files)
    for (let i = 0; i < Math.min(contributors.length, 20); i++) {
      for (let j = i + 1; j < Math.min(contributors.length, 20); j++) {
        collabGraph.recordInteraction({
          contributorA: contributors[i].name,
          contributorB: contributors[j].name,
          interactionType: 'code_review', // approximation
        });
      }
    }
  } catch {
    // Not a git repo — skip collaboration
  }

  const collabStats = collabGraph.getNetworkStats();
  collabSpinner.stop(true);
  logStep(`Collaboration graph: ${collabStats.totalEdges} edges, ${collabStats.uniqueContributors} contributors`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Persist to database
  // ═══════════════════════════════════════════════════════════════
  log('');
  const persistSpinner = createSpinner('Persisting graphs to database...');
  persistSpinner.start();

  await depGraph.persist(supabase, config.orgId);
  await expertiseGraph.persist(supabase, config.orgId);
  await collabGraph.persist(supabase, config.orgId);

  // Store code file index signals
  const codeSignals = fileIndexes.map((fi) => ({
    organization_id: config.orgId,
    source_domain: 'engineering',
    signal_type: 'code_file_indexed',
    signal_value: (fi.symbols?.length || 0) / 100,
    entity_type: 'code_file',
    entity_id: fi.filePath,
    signal_metadata: {
      language: fi.language,
      symbolCount: fi.symbols?.length || 0,
      importCount: fi.imports?.length || 0,
      exportCount: fi.exports?.length || 0,
    },
  }));

  for (let i = 0; i < codeSignals.length; i += 100) {
    const batch = codeSignals.slice(i, i + 100);
    await supabase.from('cross_domain_signals').insert(batch);
  }

  persistSpinner.stop(true);
  logStep(`Persisted: ${depStats.totalEdges} dep edges + ${expertiseStats.totalEdges} expertise + ${collabStats.totalEdges} collab + ${codeSignals.length} signals`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Create/update org_connector with ingestion stats
  // ═══════════════════════════════════════════════════════════════
  const { data: existing } = await supabase
    .from('org_connectors')
    .select('id')
    .eq('organization_id', config.orgId)
    .eq('connector_type', 'github')
    .maybeSingle();

  const connectorConfig = {
    owner: 'local',
    repo: repoName,
    repoFullName: `local/${repoName}`,
    defaultBranch: 'main',
    repoLanguage: getMostCommonLanguage(fileIndexes),
    isPrivate: true,
    connectedAt: new Date().toISOString(),
    connectedBy: 'cli-copilot-local',
    ingestion_progress: {
      step: 'complete',
      message: 'Local code intelligence pipeline complete!',
      completedAt: new Date().toISOString(),
      stats: {
        filesProcessed: fileIndexes.length,
        symbolsFound: totalSymbols,
        dependencyEdges: depStats.totalEdges,
        dependencyEntities: depStats.uniqueEntities,
        expertiseEntries: expertiseStats.totalEdges,
        expertiseContributors: expertiseStats.uniqueContributors,
        collaborationEdges: collabStats.totalEdges,
        codeSignalsStored: codeSignals.length,
      },
    },
  };

  if (existing) {
    await supabase
      .from('org_connectors')
      .update({ status: 'active', config: connectorConfig, error_message: null })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('org_connectors')
      .insert({
        organization_id: config.orgId,
        connector_type: 'github',
        status: 'active',
        config: connectorConfig,
        signals_count: codeSignals.length,
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════════════════════
  log(`\n  ${C.green}═══════════════════════════════════════════════════${C.reset}`);
  log(`  ${C.green}✓ Code intelligence loaded for ${repoName}${C.reset}`);
  log(`  ${C.green}═══════════════════════════════════════════════════${C.reset}`);

  log(`\n  ${C.dim}Summary:${C.reset}`);
  log(`    Files parsed:     ${fileIndexes.length}`);
  log(`    Symbols found:    ${totalSymbols}`);
  log(`    Dep edges:        ${depStats.totalEdges}`);
  log(`    Expertise entries: ${expertiseStats.totalEdges}`);
  log(`    Collab edges:     ${collabStats.totalEdges}`);
  log(`    Signals stored:   ${codeSignals.length}`);

  log(`\n  ${C.dim}Run the copilot:${C.reset} pnpm start\n`);
}

function getMostCommonLanguage(fileIndexes: any[]): string {
  const counts = new Map<string, number>();
  for (const fi of fileIndexes) {
    const lang = fi.language || 'unknown';
    counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  let best = 'TypeScript';
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════

main().catch((err) => {
  console.error(`\n  ${C.red}Fatal error:${C.reset}`, err.message || err);
  process.exit(1);
});

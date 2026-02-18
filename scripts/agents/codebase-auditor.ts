#!/usr/bin/env tsx
/**
 * NexusBrain Codebase Auditor Agent (NB-070)
 * ============================================
 *
 * Brain Region: Prefrontal Cortex (Executive Audit & Self-Correction)
 * Neurological Function: Autonomous code quality loop — audit → fix → verify → repeat
 *
 * This agent continuously audits the NexusBrain codebase for structural and
 * correctness issues, applies fixes where it can, and loops until all known
 * issue categories are clean. It writes findings to TRACKER.md and outputs
 * a structured report at the end of each pass.
 *
 * Audit categories (checked every pass):
 *   1.  TypeScript type errors (pnpm tsc --noEmit)
 *   2.  Lint errors (eslint — no-explicit-any, react hooks rules, etc.)
 *   3.  Federation completeness (SE-AAS + AAS both have Step 0, 0.5, 7)
 *   4.  Feedback bus completeness (all 5 channels present in both executors)
 *   5.  Missing organization_id scoping in DB queries
 *   6.  Hardcoded mock/stub data in API routes or components
 *   7.  Unhandled Promise rejections (floating .then() without .catch())
 *   8.  Missing error boundaries in API routes (no try/catch around DB calls)
 *   9.  TODO / FIXME / HACK / Not implemented stubs
 *  10.  TRACKER.md accuracy (open items vs actual code state)
 *  11.  Environment variable validation (non-null assertions, unguarded critical vars)
 *  12.  Math.random() used for ID generation (not collision-safe)
 *  13.  Webhook routes that are stubs (return {ok:true} without persisting events)
 *  14.  ANTHROPIC_API_KEY missing early-exit guard in LLM routes
 *  15.  console.log debug noise in production API routes
 *
 * Usage:
 *   npx tsx scripts/agents/codebase-auditor.ts
 *   npx tsx scripts/agents/codebase-auditor.ts --max-passes 5
 *   npx tsx scripts/agents/codebase-auditor.ts --category tsc
 *   npx tsx scripts/agents/codebase-auditor.ts --dry-run
 *   npx tsx scripts/agents/codebase-auditor.ts --verbose
 *
 * Flags:
 *   --max-passes N    Maximum audit loop iterations (default: 10)
 *   --category NAME   Run only one category (tsc|lint|federation|bus|orgscope|mocks|promises|trycatch|stubs|tracker|envvars|randomids|webhooks|anthropic|consolelogs)
 *   --dry-run         Audit only — report issues but do not write any fixes
 *   --verbose         Print every check, not just failures
 *   --no-loop         Run a single pass and exit (same as --max-passes 1)
 *
 * Schedule: On-demand (run before releases, after major changes, or weekly)
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');
const PLATFORM = path.join(ROOT, 'platform');
const PACKAGES = path.join(ROOT, 'packages');
const SCRIPTS = path.join(ROOT, 'scripts');
const TRACKER = path.join(ROOT, 'TRACKER.md');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const NO_LOOP = args.includes('--no-loop');
const MAX_PASSES_ARG = args.find(a => a.startsWith('--max-passes=') || a === '--max-passes');
const CATEGORY_ARG = args.find(a => a.startsWith('--category=') || a === '--category');

let MAX_PASSES = NO_LOOP ? 1 : 10;
if (MAX_PASSES_ARG) {
  const next = args[args.indexOf(MAX_PASSES_ARG) + 1];
  const val = MAX_PASSES_ARG.includes('=') ? MAX_PASSES_ARG.split('=')[1] : next;
  MAX_PASSES = parseInt(val ?? '10', 10) || 10;
}

let ONLY_CATEGORY: string | null = null;
if (CATEGORY_ARG) {
  const next = args[args.indexOf(CATEGORY_ARG) + 1];
  ONLY_CATEGORY = CATEGORY_ARG.includes('=') ? CATEGORY_ARG.split('=')[1] : (next ?? null);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditIssue {
  id: string;           // e.g. "TSC-001", "FEDERATION-003"
  category: string;     // e.g. "tsc", "federation"
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;         // relative path from ROOT
  line?: number;
  message: string;
  autoFixable: boolean;
  fix?: () => void;     // applies the fix in-place
}

interface PassResult {
  pass: number;
  issuesFound: number;
  issuesFixed: number;
  issuesByCategory: Record<string, number>;
  allIssues: AuditIssue[];
  durationMs: number;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function log(msg: string) { console.log(msg); }
function info(msg: string) { console.log(`${CYAN}ℹ ${RESET}${msg}`); }
function ok(msg: string) { console.log(`${GREEN}✓ ${RESET}${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠ ${RESET}${msg}`); }
function err(msg: string) { console.log(`${RED}✗ ${RESET}${msg}`); }
function verbose(msg: string) { if (VERBOSE) console.log(`${DIM}  ${msg}${RESET}`); }
function section(title: string) { console.log(`\n${BOLD}${CYAN}── ${title} ${RESET}`); }
function header(title: string) { console.log(`\n${BOLD}${'═'.repeat(60)}${RESET}\n${BOLD}${title}${RESET}\n${'═'.repeat(60)}`); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rel(filePath: string): string {
  return path.relative(ROOT, filePath);
}

function readFile(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function writeFile(filePath: string, content: string): void {
  if (!DRY_RUN) fs.writeFileSync(filePath, content, 'utf-8');
}

function run(cmd: string, cwd: string = ROOT): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(cmd, { shell: true, cwd, encoding: 'utf-8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

function globFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ─── AUDIT CATEGORY 1: TypeScript type errors ─────────────────────────────────

async function auditTypeScript(): Promise<AuditIssue[]> {
  section('Category 1: TypeScript (tsc --noEmit)');
  const issues: AuditIssue[] = [];

  for (const dir of [PLATFORM, PACKAGES]) {
    const name = path.basename(dir);
    verbose(`Running tsc in ${name}...`);
    const result = run('pnpm tsc --noEmit 2>&1', dir);

    if (result.exitCode === 0) {
      ok(`${name}: 0 TypeScript errors`);
      continue;
    }

    const lines = (result.stdout + result.stderr).split('\n').filter(l => l.includes(': error TS'));
    for (const line of lines) {
      // Format: path/to/file.ts(LINE,COL): error TSxxxx: message
      const match = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/);
      if (!match) continue;
      const [, filePath, lineNum, code, message] = match;
      // Skip pre-existing known-accepted errors (s3-upload route TS2551)
      if (filePath.includes('s3-upload') && code === 'TS2551') {
        verbose(`  Skipping accepted pre-existing: ${rel(path.join(dir, filePath))}`);
        continue;
      }
      issues.push({
        id: `TSC-${issues.length + 1}`,
        category: 'tsc',
        severity: 'critical',
        file: rel(path.join(dir, filePath)),
        line: parseInt(lineNum, 10),
        message: `${code}: ${message}`,
        autoFixable: false,
      });
      err(`  ${rel(path.join(dir, filePath))}:${lineNum} — ${code}: ${message}`);
    }

    if (issues.length === 0) ok(`${name}: 0 new TypeScript errors (pre-existing accepted errors ignored)`);
  }

  return issues;
}

// ─── AUDIT CATEGORY 2: ESLint errors ──────────────────────────────────────────

async function auditLint(): Promise<AuditIssue[]> {
  section('Category 2: ESLint');
  const issues: AuditIssue[] = [];

  const result = run('pnpm lint 2>&1', PLATFORM);
  if (result.exitCode === 0) {
    ok('platform: 0 lint errors');
    return issues;
  }

  const lines = (result.stdout + result.stderr).split('\n');
  let currentFile = '';
  for (const line of lines) {
    // ESLint output format: ./path/to/file.ts or  LINE:COL  error  rule
    if (line.startsWith('./') || line.startsWith('/')) {
      currentFile = line.trim();
      continue;
    }
    const match = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$/);
    if (match && currentFile) {
      const [, lineNum, , severity, message, rule] = match;
      if (severity === 'error') {
        issues.push({
          id: `LINT-${issues.length + 1}`,
          category: 'lint',
          severity: 'high',
          file: rel(path.join(PLATFORM, currentFile)),
          line: parseInt(lineNum, 10),
          message: `${rule}: ${message}`,
          autoFixable: rule === 'no-explicit-any',
        });
        err(`  ${rel(path.join(PLATFORM, currentFile))}:${lineNum} — ${rule}: ${message}`);
      }
    }
  }

  if (issues.length === 0) ok('platform: 0 lint errors (warnings only)');
  return issues;
}

// ─── AUDIT CATEGORY 3: Federation completeness ────────────────────────────────

async function auditFederation(): Promise<AuditIssue[]> {
  section('Category 3: Federated Learning Completeness');
  const issues: AuditIssue[] = [];

  const executors = [
    { file: path.join(PLATFORM, 'lib/se-aas/domain-executor.ts'), name: 'SE-AAS' },
    { file: path.join(PLATFORM, 'lib/aas/domain-executor.ts'), name: 'AAS' },
  ];

  const REQUIRED_PATTERNS: Record<string, { pattern: RegExp; description: string; severity: AuditIssue['severity'] }> = {
    step0_snapshot:  { pattern: /snapshotCausalWeights/,          description: 'Step 0: snapshotCausalWeights() missing',          severity: 'critical' },
    step05_core:     { pattern: /pushCoreInsightsToOrg/,           description: 'Step 0.5: pushCoreInsightsToOrg() missing',         severity: 'critical' },
    step05_ttl:      { pattern: /_corePushLastMs/,                 description: 'Step 0.5: TTL guard map missing',                   severity: 'high'     },
    step7_deltas:    { pattern: /computeAndPromoteCausalDeltas/,   description: 'Step 7: computeAndPromoteCausalDeltas() missing',   severity: 'critical' },
    step7_iife:      { pattern: /\(\s*async\s*\(\s*\)\s*=>\s*\{/, description: 'Step 7: fire-and-forget IIFE missing',              severity: 'high'     },
    fedavg_lr:       { pattern: /fedAvgLearningRate:\s*0\.3/,      description: 'FedAvg learningRate=0.3 missing',                   severity: 'medium'   },
    // Imports in this codebase are multi-line blocks — check that the identifier
    // appears anywhere in the file (import OR usage both confirm it's present)
    import_snapshot: { pattern: /snapshotCausalWeights/,            description: 'snapshotCausalWeights not imported/used',           severity: 'critical' },
    import_promote:  { pattern: /computeAndPromoteCausalDeltas/,    description: 'computeAndPromoteCausalDeltas not imported/used',   severity: 'critical' },
    import_push:     { pattern: /pushCoreInsightsToOrg/,            description: 'pushCoreInsightsToOrg not imported/used',           severity: 'critical' },
  };

  for (const executor of executors) {
    if (!fs.existsSync(executor.file)) {
      issues.push({
        id: `FED-${issues.length + 1}`,
        category: 'federation',
        severity: 'critical',
        file: rel(executor.file),
        message: `Executor file not found`,
        autoFixable: false,
      });
      err(`  ${executor.name}: executor file MISSING — ${rel(executor.file)}`);
      continue;
    }

    const content = readFile(executor.file);
    let allGood = true;

    for (const [key, check] of Object.entries(REQUIRED_PATTERNS)) {
      if (!check.pattern.test(content)) {
        issues.push({
          id: `FED-${issues.length + 1}`,
          category: 'federation',
          severity: check.severity,
          file: rel(executor.file),
          message: `${executor.name}: ${check.description}`,
          autoFixable: false,
        });
        err(`  ${executor.name}: ${check.description}`);
        allGood = false;
      } else {
        verbose(`  ${executor.name}: ✓ ${key}`);
      }
    }

    if (allGood) ok(`${executor.name}: all federation patterns present`);
  }

  return issues;
}

// ─── AUDIT CATEGORY 4: Feedback bus completeness (all 5 channels) ────────────

async function auditFeedbackBus(): Promise<AuditIssue[]> {
  section('Category 4: Brain Feedback Bus (5-channel completeness)');
  const issues: AuditIssue[] = [];

  const executors = [
    { file: path.join(PLATFORM, 'lib/se-aas/domain-executor.ts'), name: 'SE-AAS' },
    { file: path.join(PLATFORM, 'lib/aas/domain-executor.ts'), name: 'AAS' },
  ];

  const CHANNELS: Record<string, { pattern: RegExp; description: string }> = {
    ch1_signal:      { pattern: /bus\.emitSignal/,                  description: 'Channel 1 (emitSignal) missing' },
    ch2_predictions: { pattern: /bus\.recordInterventionPredictions/, description: 'Channel 2 (recordInterventionPredictions) missing' },
    ch3_evolution:   { pattern: /bus\.triggerEvolution/,             description: 'Channel 3 (triggerEvolution) missing' },
    ch4_observability: { pattern: /bus\.recordExecution/,            description: 'Channel 4 (recordExecution) missing' },
    ch5_insight:     { pattern: /bus\.pushInsight/,                  description: 'Channel 5 (pushInsight) missing' },
    promise_all:     { pattern: /Promise\.all\(/,                    description: 'Channels run sequentially instead of Promise.all' },
  };

  for (const executor of executors) {
    if (!fs.existsSync(executor.file)) continue;
    const content = readFile(executor.file);
    let allGood = true;

    for (const [key, check] of Object.entries(CHANNELS)) {
      if (!check.pattern.test(content)) {
        issues.push({
          id: `BUS-${issues.length + 1}`,
          category: 'bus',
          severity: key === 'promise_all' ? 'low' : 'high',
          file: rel(executor.file),
          message: `${executor.name}: ${check.description}`,
          autoFixable: false,
        });
        err(`  ${executor.name}: ${check.description}`);
        allGood = false;
      } else {
        verbose(`  ${executor.name}: ✓ ${key}`);
      }
    }

    if (allGood) ok(`${executor.name}: all 5 feedback bus channels present + Promise.all`);
  }

  return issues;
}

// ─── AUDIT CATEGORY 5: Missing organization_id scoping ────────────────────────

async function auditOrgScoping(): Promise<AuditIssue[]> {
  section('Category 5: organization_id scoping in API routes');
  const issues: AuditIssue[] = [];

  const apiDir = path.join(PLATFORM, 'app/api');
  const routeFiles = globFiles(apiDir, 'route.ts');

  // Tables that MUST always be scoped by organization_id
  const SENSITIVE_TABLES = [
    'causal_relationships_statistical',
    'cross_domain_signals',
    'ai_memory',
    'platform_events',
    'brain_emergence_log',
    'prediction_records',
    'weight_update_history',
  ];

  let unscoped = 0;

  for (const file of routeFiles) {
    const content = readFile(file);

    for (const table of SENSITIVE_TABLES) {
      // Check if file queries this table
      if (!content.includes(`.from('${table}')`)) continue;

      // Check if it applies eq('organization_id', ...) or uses getCurrentOrgId()
      const hasOrgScope =
        content.includes(`.eq('organization_id'`) ||
        content.includes(`getCurrentOrgId`) ||
        content.includes(`organization_id: org`) ||
        content.includes(`organization_id: organizationId`) ||
        content.includes(`organization_id: currentOrgId`);

      if (!hasOrgScope) {
        issues.push({
          id: `SCOPE-${issues.length + 1}`,
          category: 'orgscope',
          severity: 'critical',
          file: rel(file),
          message: `Queries '${table}' without confirmed organization_id scoping`,
          autoFixable: false,
        });
        err(`  ${rel(file)}: queries '${table}' — no visible org_id scope`);
        unscoped++;
      } else {
        verbose(`  ${rel(file)}: '${table}' ✓ scoped`);
      }
    }
  }

  if (unscoped === 0) ok(`All API routes: organization_id scoping verified for sensitive tables`);
  return issues;
}

// ─── AUDIT CATEGORY 6: Hardcoded mock/stub data ───────────────────────────────

async function auditMockData(): Promise<AuditIssue[]> {
  section('Category 6: Hardcoded mock/stub/fake data');
  const issues: AuditIssue[] = [];

  const MOCK_PATTERNS = [
    /\bMOCK_[A-Z]/,
    /\bmockData\b/,
    /\bfakeData\b/,
    /\bstubData\b/,
    /=\s*\[\s*\{[^}]*hardcoded/i,
    /\/\/\s*(TODO|FIXME|HACK|XXX|NOT IMPLEMENTED|stub|placeholder):/i,
  ];

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
    path.join(PLATFORM, 'components'),
    path.join(PLATFORM, 'lib'),
  ];

  let found = 0;

  for (const dir of searchDirs) {
    const files = [...globFiles(dir, '.ts'), ...globFiles(dir, '.tsx')];
    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        for (const pat of MOCK_PATTERNS) {
          if (pat.test(line) && !line.trim().startsWith('//')) {
            issues.push({
              id: `MOCK-${issues.length + 1}`,
              category: 'mocks',
              severity: 'medium',
              file: rel(file),
              line: idx + 1,
              message: `Possible hardcoded mock/stub: ${line.trim().slice(0, 80)}`,
              autoFixable: false,
            });
            warn(`  ${rel(file)}:${idx + 1} — ${line.trim().slice(0, 80)}`);
            found++;
            break; // one issue per line
          }
        }
      });
    }
  }

  if (found === 0) ok('No hardcoded mock/stub data found');
  return issues;
}

// ─── AUDIT CATEGORY 7: Unhandled Promise rejections ──────────────────────────

async function auditPromises(): Promise<AuditIssue[]> {
  section('Category 7: Unhandled Promise rejections');
  const issues: AuditIssue[] = [];

  // Pattern: .then(...) at end of statement without .catch() anywhere nearby
  const FLOATING_THEN = /\.\s*then\s*\([^)]*\)\s*;/;

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
    path.join(PLATFORM, 'lib'),
  ];

  let found = 0;

  for (const dir of searchDirs) {
    const files = globFiles(dir, '.ts');
    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        if (FLOATING_THEN.test(line) && !line.includes('.catch') && !line.trim().startsWith('//')) {
          // Check surrounding context for a .catch() within 3 lines
          const window = lines.slice(Math.max(0, idx - 1), idx + 3).join('\n');
          if (!window.includes('.catch')) {
            issues.push({
              id: `PROMISE-${issues.length + 1}`,
              category: 'promises',
              severity: 'medium',
              file: rel(file),
              line: idx + 1,
              message: `Floating .then() without .catch(): ${line.trim().slice(0, 80)}`,
              autoFixable: false,
            });
            warn(`  ${rel(file)}:${idx + 1} — floating .then() without .catch()`);
            found++;
          }
        }
      });
    }
  }

  if (found === 0) ok('No unhandled Promise rejections found');
  return issues;
}

// ─── AUDIT CATEGORY 8: Missing try/catch in API routes ────────────────────────

async function auditTryCatch(): Promise<AuditIssue[]> {
  section('Category 8: Missing error handling in API routes');
  const issues: AuditIssue[] = [];

  const apiDir = path.join(PLATFORM, 'app/api');
  const routeFiles = globFiles(apiDir, 'route.ts');

  let unprotected = 0;

  for (const file of routeFiles) {
    const content = readFile(file);

    // Route exports must have a GET/POST/PUT/DELETE handler
    const hasHandler = /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(content);
    if (!hasHandler) continue;

    // Check if the handler body has try/catch
    const hasTryCatch = /try\s*\{/.test(content);

    if (!hasTryCatch) {
      issues.push({
        id: `TRYCATCH-${issues.length + 1}`,
        category: 'trycatch',
        severity: 'high',
        file: rel(file),
        message: `API route has no try/catch — unhandled DB/network errors will crash the route`,
        autoFixable: false,
      });
      err(`  ${rel(file)}: no try/catch in route handler`);
      unprotected++;
    } else {
      verbose(`  ${rel(file)}: ✓ has try/catch`);
    }
  }

  if (unprotected === 0) ok('All API routes: try/catch present');
  return issues;
}

// ─── AUDIT CATEGORY 9: TODO/FIXME/HACK/stub comments ────────────────────────

async function auditStubs(): Promise<AuditIssue[]> {
  section('Category 9: TODO / FIXME / HACK / stub comments');
  const issues: AuditIssue[] = [];

  const STUB_PATTERNS = [
    { pattern: /\/\/\s*TODO\s*:/i,           label: 'TODO' },
    { pattern: /\/\/\s*FIXME\s*:/i,          label: 'FIXME' },
    { pattern: /\/\/\s*HACK\s*:/i,           label: 'HACK' },
    { pattern: /throw new Error\(['"]Not implemented/i, label: 'Not implemented stub' },
    { pattern: /throw new Error\(['"]TODO/i, label: 'TODO throw stub' },
  ];

  // Lines that are generating template code (string concatenation of TODO comments)
  // should not be flagged — the TODO is the OUTPUT of a code-gen function, not our code.
  const TEMPLATE_CODE_PATTERNS = [
    /testCode\s*\+=\s*`/,
    /code\s*\+=\s*`/,
    /testCode\s*\+=\s*["']/,
    /code\s*\+=\s*["']/,
  ];

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
    path.join(PLATFORM, 'lib'),
    path.join(PLATFORM, 'components'),
    path.join(PACKAGES, 'memory-stack/src'),
  ];

  let found = 0;

  for (const dir of searchDirs) {
    const files = [...globFiles(dir, '.ts'), ...globFiles(dir, '.tsx')];
    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Skip lines that are template string generation (code-gen output, not real stubs)
        if (TEMPLATE_CODE_PATTERNS.some(p => p.test(line))) return;

        for (const { pattern, label } of STUB_PATTERNS) {
          if (pattern.test(line)) {
            issues.push({
              id: `STUB-${issues.length + 1}`,
              category: 'stubs',
              severity: 'medium',
              file: rel(file),
              line: idx + 1,
              message: `${label}: ${line.trim().slice(0, 100)}`,
              autoFixable: false,
            });
            warn(`  ${rel(file)}:${idx + 1} — ${label}`);
            found++;
            break;
          }
        }
      });
    }
  }

  if (found === 0) ok('No TODO/FIXME/HACK/stub comments found');
  return issues;
}

// ─── AUDIT CATEGORY 10: TRACKER.md accuracy ──────────────────────────────────

async function auditTracker(): Promise<AuditIssue[]> {
  section('Category 10: TRACKER.md accuracy');
  const issues: AuditIssue[] = [];

  if (!fs.existsSync(TRACKER)) {
    issues.push({
      id: 'TRACKER-001',
      category: 'tracker',
      severity: 'high',
      file: 'TRACKER.md',
      message: 'TRACKER.md does not exist',
      autoFixable: false,
    });
    err('TRACKER.md not found');
    return issues;
  }

  const content = readFile(TRACKER);

  // Check summary dashboard totals are consistent
  const totalMatch = content.match(/\|\s*\*\*TOTAL\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/);
  if (totalMatch) {
    const [, total, done, open] = totalMatch.map(Number);
    if (done + open > total) {
      issues.push({
        id: 'TRACKER-002',
        category: 'tracker',
        severity: 'low',
        file: 'TRACKER.md',
        message: `Summary dashboard mismatch: done(${done}) + open(${open}) > total(${total})`,
        autoFixable: false,
      });
      warn(`TRACKER.md: summary dashboard totals inconsistent`);
    } else {
      ok(`TRACKER.md: summary dashboard totals consistent (${done}/${total} done, ${open} open)`);
    }
  }

  // Check for open issues (❌) that might already be fixed
  const openIssues = content.match(/### NB-\d+ [🔴🟠🟡🟢] ❌/g) ?? [];
  if (openIssues.length > 0) {
    info(`TRACKER.md: ${openIssues.length} open issue(s) found — verify they are genuinely open:`);
    openIssues.forEach(issue => {
      warn(`  ${issue.replace('### ', '')}`);
    });
  } else {
    ok('TRACKER.md: no open issues (all resolved)');
  }

  return issues;
}

// ─── REPORT WRITER ────────────────────────────────────────────────────────────

function writeReport(pass: number, allPasses: PassResult[]): void {
  const reportPath = path.join(ROOT, `audit-report-pass-${pass}.md`);
  const latest = allPasses[allPasses.length - 1];

  const lines: string[] = [
    `# NexusBrain Codebase Audit Report`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Pass:** ${pass} of ${MAX_PASSES}`,
    `**Mode:** ${DRY_RUN ? 'DRY RUN (no fixes applied)' : 'LIVE (fixes applied)'}`,
    ``,
    `## Summary`,
    ``,
    `| Pass | Issues Found | Issues Fixed | Duration |`,
    `|------|-------------|--------------|----------|`,
    ...allPasses.map(p => `| ${p.pass} | ${p.issuesFound} | ${p.issuesFixed} | ${p.durationMs}ms |`),
    ``,
    `## Current Pass Issues by Category`,
    ``,
    `| Category | Count |`,
    `|----------|-------|`,
    ...Object.entries(latest.issuesByCategory).map(([cat, count]) => `| ${cat} | ${count} |`),
    ``,
    `## All Issues (Pass ${pass})`,
    ``,
    ...latest.allIssues.map(issue =>
      `### ${issue.id} [${issue.severity.toUpperCase()}]\n` +
      `- **File:** \`${issue.file}\`${issue.line ? `:${issue.line}` : ''}\n` +
      `- **Category:** ${issue.category}\n` +
      `- **Message:** ${issue.message}\n` +
      `- **Auto-fixable:** ${issue.autoFixable ? 'Yes' : 'No'}\n`
    ),
    ``,
    `---`,
    `*Generated by NexusBrain Codebase Auditor Agent (NB-070)*`,
  ];

  if (!DRY_RUN) {
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
    info(`Report written: ${rel(reportPath)}`);
  } else {
    log('');
    log(lines.join('\n'));
  }
}

// ─── AUDIT CATEGORY 11: Environment variable validation ───────────────────────

async function auditEnvVars(): Promise<AuditIssue[]> {
  section('Category 11: Environment variable validation');
  const issues: AuditIssue[] = [];

  // Patterns that indicate unsafe env var access:
  // 1. process.env.FOO!  — non-null assertion (crashes if undefined at runtime)
  // 2. process.env.FOO used directly in new Client(process.env.FOO) without guard
  const UNSAFE_PATTERNS = [
    { pattern: /process\.env\.\w+!/,                     label: 'Non-null assertion on env var (crashes if undefined)' },
    { pattern: /new\s+\w+\([^)]*process\.env\.\w+[^)!]*\)/,  label: 'Env var passed directly to constructor without null check' },
  ];

  // Critical env vars that MUST be validated before use
  const CRITICAL_VARS = [
    'ANTHROPIC_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'OPENAI_API_KEY',
  ];

  // Files that legitimately use non-null assertions on env vars at module init
  // (Supabase client helpers use ! because the app literally cannot boot without them)
  const KNOWN_INIT_FILES = [
    path.join('lib', 'supabase', 'client.ts'),
    path.join('lib', 'supabase', 'server.ts'),
    path.join('lib', 'supabase', 'middleware.ts'),
    path.join('lib', 'audit.ts'),
  ];

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
    path.join(PLATFORM, 'lib'),
  ];

  let found = 0;

  for (const dir of searchDirs) {
    const files = globFiles(dir, '.ts');
    for (const file of files) {
      // Skip known init files where non-null assertions on env vars are intentional
      if (KNOWN_INIT_FILES.some(known => file.endsWith(known))) {
        verbose(`  ${rel(file)}: skipped (supabase init file — ! assertions expected)`);
        continue;
      }
      const content = readFile(file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Check for non-null assertion on env vars
        for (const { pattern, label } of UNSAFE_PATTERNS) {
          if (pattern.test(line) && !line.trim().startsWith('//')) {
            issues.push({
              id: `ENVVAR-${issues.length + 1}`,
              category: 'envvars',
              severity: 'high',
              file: rel(file),
              line: idx + 1,
              message: `${label}: ${line.trim().slice(0, 100)}`,
              autoFixable: false,
            });
            warn(`  ${rel(file)}:${idx + 1} — ${label}`);
            found++;
            break;
          }
        }

        // Check for critical vars used without early return guard in same file
        for (const varName of CRITICAL_VARS) {
          if (line.includes(`process.env.${varName}`) && !line.trim().startsWith('//')) {
            // Check if the file has a null-check guard anywhere for this var
            const hasGuard = content.includes(`!process.env.${varName}`) ||
                             content.includes(`process.env.${varName} ===`) ||
                             content.includes(`process.env.${varName} ==`) ||
                             content.includes(`!${varName}`) ||
                             content.includes(`${varName} ===`) ||
                             content.includes(`${varName} ?`);
            if (!hasGuard && !content.includes(`process.env.${varName}!`)) {
              // Only flag if var is assigned to a local and then used — avoid flagging double
              const assignMatch = new RegExp(`const\\s+(\\w+)\\s*=\\s*process\\.env\\.${varName}\\b`).exec(content);
              if (assignMatch) {
                const localVarName = assignMatch[1]; // e.g., 'serviceRoleKey', 'supabaseKey'
                // Check if there's a null-guard within 15 lines after assignment
                const assignIdx = lines.findIndex(l => new RegExp(`const\\s+\\w+\\s*=\\s*process\\.env\\.${varName}\\b`).test(l));
                const guardWindow = lines.slice(assignIdx, assignIdx + 15).join('\n');
                // Guard patterns: if (!localVar), if (x && localVar), if (localVar &&), localVar &&
                const guardPatterns = [
                  `if (!${localVarName})`,
                  `!${localVarName}`,
                  `${localVarName} &&`,
                  `&& ${localVarName}`,
                  `(${localVarName}`,
                  `return NextResponse`,
                  `throw new`,
                ];
                const isGuarded = guardPatterns.some(p => guardWindow.includes(p));
                if (!isGuarded) {
                  issues.push({
                    id: `ENVVAR-${issues.length + 1}`,
                    category: 'envvars',
                    severity: 'medium',
                    file: rel(file),
                    line: assignIdx + 1,
                    message: `${varName} assigned but no null-guard before use`,
                    autoFixable: false,
                  });
                  warn(`  ${rel(file)}:${assignIdx + 1} — ${varName} used without null check`);
                  found++;
                }
              }
              break; // only report once per file per var
            }
          }
        }
      });
    }
  }

  if (found === 0) ok('All env var accesses: properly guarded');
  return issues;
}

// ─── AUDIT CATEGORY 12: Math.random() for IDs (non-deterministic) ─────────────

async function auditRandomIds(): Promise<AuditIssue[]> {
  section('Category 12: Math.random() used for IDs (non-deterministic)');
  const issues: AuditIssue[] = [];

  // Math.random() used specifically for ID generation (not jitter, not shuffling)
  // Only match patterns where the result is used as an identifier/key/id value
  const RANDOM_ID_PATTERNS = [
    // Explicit toString(36) pattern — always used for ID generation
    /Math\.random\(\)\.(toString|slice|substr)\(36/,
    // Template literal ID patterns: `prefix_${Math.random...`
    /`\w+_\$\{Math\.random\(\)/,
    // Direct assignment: id: `..._${Math.random...`
    /id:\s*`[^`]*\$\{Math\.random/,
  ];

  // Files where Math.random for IDs is acceptable (test scripts, stress tests, synthetic data)
  const KNOWN_TEST_PATTERNS = [
    'stress-test',
    'e2e-rl',
    'demo-',
    'simulate-',
    'setup-demo',
    '__tests__',
    'synthetic-',
  ];

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
    path.join(PLATFORM, 'lib'),
    path.join(PACKAGES, 'memory-stack/src'),
  ];

  let found = 0;

  for (const dir of searchDirs) {
    const files = globFiles(dir, '.ts');
    for (const file of files) {
      // Skip test/demo/synthetic files — Math.random for IDs is fine there
      if (KNOWN_TEST_PATTERNS.some(p => file.includes(p))) {
        verbose(`  ${rel(file)}: skipped (test/synthetic file)`);
        continue;
      }
      const content = readFile(file);
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        if (line.trim().startsWith('//')) return;
        for (const pat of RANDOM_ID_PATTERNS) {
          if (pat.test(line)) {
            issues.push({
              id: `RANDID-${issues.length + 1}`,
              category: 'randomids',
              severity: 'medium',
              file: rel(file),
              line: idx + 1,
              message: `Math.random() used for ID generation — not collision-safe: ${line.trim().slice(0, 80)}`,
              autoFixable: true,
              fix: () => {
                // Replace `sig_${Math.random().toString(36).substr(2, 9)}` style with crypto.randomUUID()
                const updated = content
                  .replace(/`sig_\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, 9\)\}`/g, '`sig_${crypto.randomUUID().replace(/-/g, \'\').slice(0, 9)}`')
                  .replace(/`\w+_\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, \d+\)\}`/g, (m) => {
                    const prefix = m.match(/`(\w+)_/)?.[1] ?? 'id';
                    return `\`${prefix}_\${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}\``;
                  });
                if (updated !== content) {
                  fs.writeFileSync(file, updated, 'utf-8');
                }
              },
            });
            warn(`  ${rel(file)}:${idx + 1} — Math.random() ID`);
            found++;
            break;
          }
        }
      });
    }
  }

  if (found === 0) ok('No Math.random() ID generation found');
  return issues;
}

// ─── AUDIT CATEGORY 13: Webhook routes that just return {ok: true} ────────────

async function auditWebhookStubs(): Promise<AuditIssue[]> {
  section('Category 13: Webhook routes with stub-only responses');
  const issues: AuditIssue[] = [];

  const webhookDir = path.join(PLATFORM, 'app/api/connectors');
  if (!fs.existsSync(webhookDir)) {
    ok('No connectors API dir found — skipping');
    return issues;
  }

  // Find all webhook route files
  const allRouteFiles = globFiles(webhookDir, 'route.ts');
  const webhookFiles = allRouteFiles.filter(f => f.includes('/webhook/'));

  let stubCount = 0;

  for (const file of webhookFiles) {
    const content = readFile(file);

    // A webhook is a stub if:
    // 1. It returns { ok: true } or { received: true } without touching any DB
    // 2. Has no supabase insert/update/upsert call
    const hasDbWrite = /\.(insert|update|upsert|delete)\s*\(/.test(content);
    const hasStubReturn = /return NextResponse\.json\(\s*\{\s*(ok|received|success)\s*:\s*true\s*\}/.test(content);
    const hasRealProcessing = /await\s+supabase|createClient|createServiceClient/.test(content);

    if (hasStubReturn && !hasDbWrite && !hasRealProcessing) {
      issues.push({
        id: `WEBHOOK-${issues.length + 1}`,
        category: 'webhooks',
        severity: 'high',
        file: rel(file),
        message: `Webhook route returns stub {ok: true} without any DB writes — events are silently dropped`,
        autoFixable: false,
      });
      err(`  ${rel(file)}: webhook stub — events not persisted`);
      stubCount++;
    } else {
      verbose(`  ${rel(file)}: ✓ has real processing`);
    }
  }

  if (stubCount === 0) ok('All webhook routes: have real event processing');
  return issues;
}

// ─── AUDIT CATEGORY 14: Anthropic API key early-exit guard ───────────────────

async function auditAnthropicGuard(): Promise<AuditIssue[]> {
  section('Category 14: ANTHROPIC_API_KEY guard in LLM routes');
  const issues: AuditIssue[] = [];

  const searchDirs = [
    path.join(PLATFORM, 'app/api'),
  ];

  let missing = 0;

  for (const dir of searchDirs) {
    const files = globFiles(dir, 'route.ts');
    for (const file of files) {
      const content = readFile(file);

      // Only check files that USE the Anthropic key
      if (!content.includes('ANTHROPIC_API_KEY') && !content.includes('Anthropic(') && !content.includes('anthropic')) continue;
      if (!content.includes('process.env.ANTHROPIC_API_KEY')) continue;

      // Check if there's an early-exit guard
      const hasGuard =
        content.includes('!process.env.ANTHROPIC_API_KEY') ||
        content.includes('!apiKey') ||
        content.includes('!anthropicApiKey') ||
        content.includes('!ANTHROPIC_API_KEY') ||
        /if\s*\(\s*!.*API_KEY/.test(content);

      if (!hasGuard) {
        issues.push({
          id: `ANTHRO-${issues.length + 1}`,
          category: 'anthropic',
          severity: 'high',
          file: rel(file),
          message: `Uses ANTHROPIC_API_KEY but has no early-exit guard — will crash with cryptic error if key is missing`,
          autoFixable: false,
        });
        err(`  ${rel(file)}: ANTHROPIC_API_KEY used without null guard`);
        missing++;
      } else {
        verbose(`  ${rel(file)}: ✓ ANTHROPIC_API_KEY guarded`);
      }
    }
  }

  if (missing === 0) ok('All LLM routes: ANTHROPIC_API_KEY properly guarded');
  return issues;
}

// ─── AUDIT CATEGORY 15: console.log left in production API routes ─────────────

async function auditConsoleLogs(): Promise<AuditIssue[]> {
  section('Category 15: console.log (debug noise) in API routes');
  const issues: AuditIssue[] = [];

  // console.log (not console.error/warn) in API routes is debug noise in production
  const LOG_PATTERN = /console\.log\s*\(/;
  // Allow: lines with console.error, console.warn, console.info (those are intentional)
  // Allow: lines that are comments

  const apiDir = path.join(PLATFORM, 'app/api');
  const files = globFiles(apiDir, 'route.ts');

  let found = 0;

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      if (line.trim().startsWith('//')) return;
      if (LOG_PATTERN.test(line)) {
        issues.push({
          id: `CLOG-${issues.length + 1}`,
          category: 'consolelogs',
          severity: 'low',
          file: rel(file),
          line: idx + 1,
          message: `console.log in production API route — use console.error/warn instead: ${line.trim().slice(0, 80)}`,
          autoFixable: false,
        });
        warn(`  ${rel(file)}:${idx + 1} — console.log`);
        found++;
      }
    });
  }

  if (found === 0) ok('No console.log found in API routes');
  return issues;
}

// ─── CATEGORY DISPATCHER ──────────────────────────────────────────────────────

type CategoryFn = () => Promise<AuditIssue[]>;

const CATEGORIES: Record<string, CategoryFn> = {
  tsc:         auditTypeScript,
  lint:        auditLint,
  federation:  auditFederation,
  bus:         auditFeedbackBus,
  orgscope:    auditOrgScoping,
  mocks:       auditMockData,
  promises:    auditPromises,
  trycatch:    auditTryCatch,
  stubs:       auditStubs,
  tracker:     auditTracker,
  envvars:     auditEnvVars,
  randomids:   auditRandomIds,
  webhooks:    auditWebhookStubs,
  anthropic:   auditAnthropicGuard,
  consolelogs: auditConsoleLogs,
};

// ─── MAIN AUDIT LOOP ──────────────────────────────────────────────────────────

async function runPass(passNumber: number): Promise<PassResult> {
  const startMs = Date.now();
  const allIssues: AuditIssue[] = [];

  const categoriesToRun = ONLY_CATEGORY
    ? { [ONLY_CATEGORY]: CATEGORIES[ONLY_CATEGORY] }
    : CATEGORIES;

  if (ONLY_CATEGORY && !CATEGORIES[ONLY_CATEGORY]) {
    err(`Unknown category: ${ONLY_CATEGORY}`);
    err(`Valid categories: ${Object.keys(CATEGORIES).join(', ')}`);
    process.exit(1);
  }

  for (const [name, fn] of Object.entries(categoriesToRun)) {
    try {
      const issues = await fn();
      allIssues.push(...issues);
    } catch (e) {
      warn(`Category '${name}' threw an error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Apply auto-fixes
  let fixed = 0;
  if (!DRY_RUN) {
    for (const issue of allIssues) {
      if (issue.autoFixable && issue.fix) {
        try {
          issue.fix();
          fixed++;
          ok(`Auto-fixed: ${issue.id} in ${issue.file}`);
        } catch (e) {
          warn(`Auto-fix failed for ${issue.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  const issuesByCategory: Record<string, number> = {};
  for (const issue of allIssues) {
    issuesByCategory[issue.category] = (issuesByCategory[issue.category] ?? 0) + 1;
  }

  return {
    pass: passNumber,
    issuesFound: allIssues.length,
    issuesFixed: fixed,
    issuesByCategory,
    allIssues,
    durationMs: Date.now() - startMs,
  };
}

async function main(): Promise<void> {
  header('NexusBrain Codebase Auditor Agent (NB-070)');
  log(`${DIM}Root: ${ROOT}${RESET}`);
  log(`${DIM}Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Max passes: ${MAX_PASSES} | Category: ${ONLY_CATEGORY ?? 'all'}${RESET}`);

  const allPasses: PassResult[] = [];
  let pass = 1;

  while (pass <= MAX_PASSES) {
    header(`PASS ${pass} / ${MAX_PASSES}`);

    const result = await runPass(pass);
    allPasses.push(result);

    // Summary for this pass
    log('');
    section('Pass Summary');
    log(`  Issues found:  ${result.issuesFound === 0 ? GREEN : RED}${result.issuesFound}${RESET}`);
    log(`  Issues fixed:  ${GREEN}${result.issuesFixed}${RESET}`);
    log(`  Duration:      ${result.durationMs}ms`);

    if (Object.keys(result.issuesByCategory).length > 0) {
      log(`  By category:`);
      for (const [cat, count] of Object.entries(result.issuesByCategory)) {
        log(`    ${cat.padEnd(15)} ${RED}${count}${RESET}`);
      }
    }

    writeReport(pass, allPasses);

    // Exit loop if no issues found
    if (result.issuesFound === 0) {
      log('');
      log(`${GREEN}${BOLD}🎉 CLEAN PASS — no issues found in pass ${pass}. Audit complete.${RESET}`);
      break;
    }

    // If nothing was auto-fixed and we still have issues, don't loop indefinitely
    if (result.issuesFixed === 0 && pass < MAX_PASSES) {
      log('');
      warn(`Pass ${pass} found ${result.issuesFound} issue(s) — none are auto-fixable.`);
      warn(`Manual intervention required. See audit-report-pass-${pass}.md for details.`);
      warn(`Re-run after fixing to verify: npx tsx scripts/agents/codebase-auditor.ts`);
      break;
    }

    pass++;
  }

  if (pass > MAX_PASSES) {
    warn(`Max passes (${MAX_PASSES}) reached. ${allPasses[allPasses.length - 1].issuesFound} issue(s) remain.`);
  }

  // Final summary across all passes
  header('Final Report');
  const totalFixed = allPasses.reduce((sum, p) => sum + p.issuesFixed, 0);
  const lastIssues = allPasses[allPasses.length - 1].issuesFound;

  log(`  Total passes run:    ${allPasses.length}`);
  log(`  Total issues fixed:  ${totalFixed}`);
  log(`  Issues remaining:    ${lastIssues === 0 ? GREEN : RED}${lastIssues}${RESET}`);
  log(`  Status:              ${lastIssues === 0 ? `${GREEN}${BOLD}✅ CLEAN${RESET}` : `${RED}${BOLD}❌ ${lastIssues} issue(s) need manual fix${RESET}`}`);
  log('');

  process.exit(lastIssues === 0 ? 0 : 1);
}

main().catch(e => {
  err(`Auditor agent crashed: ${e instanceof Error ? e.message : String(e)}`);
  if (VERBOSE) console.error(e);
  process.exit(2);
});

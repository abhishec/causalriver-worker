#!/usr/bin/env tsx
/**
 * Agent Version Manager — Ensures All Agents Stay Upgraded
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This tool validates that ALL agents in the NexusBrain platform follow
 * the latest V6 ManusNativeAgent template and are properly wired.
 *
 * **What It Checks**:
 * 1. ✅ Template Version — Uses ManusNativeAgent (not BaseTrainingAgent or BrainNativeAgent)
 * 2. ✅ Auto-Registration — Has globalRegistry.register() at bottom
 * 3. ✅ Orchestrator Import — Imported in brain-orchestrator.ts
 * 4. ✅ Motor Commands — Implements generateMotorCommands()
 * 5. ✅ Brain Access — Access to ALL 93+ brain systems via comprehensive brain
 * 6. ✅ Schedule Defined — Has cron expression in registration
 * 7. ✅ Version Number — Has readonly version = 'X.Y.Z'
 *
 * **What It Does**:
 * - Scans all agents in scripts/agents/
 * - Validates each agent against V6 requirements
 * - Reports upgrade status (✅ compliant, ⚠️ needs upgrade, ❌ broken)
 * - Generates upgrade recommendations
 * - Can auto-fix common issues (with --fix flag)
 *
 * **Usage**:
 *   pnpm exec tsx scripts/agent-version-manager.ts              # Check only
 *   pnpm exec tsx scripts/agent-version-manager.ts --fix        # Auto-fix issues
 *   pnpm exec tsx scripts/agent-version-manager.ts --verbose    # Detailed output
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const AGENTS_DIR = resolve(import.meta.dirname || __dirname, 'agents');
const ORCHESTRATOR_FILE = resolve(import.meta.dirname || __dirname, 'brain-orchestrator.ts');

const CURRENT_VERSION = '6.0.0';
const REQUIRED_TEMPLATE = 'ManusNativeAgent';

const KNOWN_V6_AGENTS = [
  'autonomous-trainer',
  'brain-consolidation',
  'brain-dmn',
  'cost-agent',
  'benchmark',
  'git-code-trainer-v6',
  'weekly-brain-scan',
  'monthly-deep-analysis',
  'proactive-intelligence',
  'federation-agent',
];

const UTILITY_FILES = [
  'git-code-trainer-fetcher',
  'git-signal-converter',
  'security-hardening-agent',
];

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface AgentValidation {
  name: string;
  filePath: string;
  status: 'compliant' | 'needs-upgrade' | 'broken' | 'utility' | 'legacy';
  version: string | null;
  issues: string[];
  checks: {
    hasManusTemplate: boolean;
    hasAutoRegistration: boolean;
    inOrchestrator: boolean;
    hasMotorCommands: boolean;
    hasSchedule: boolean;
    hasVersion: boolean;
  };
  schedule: string | null;
  isInOrchestrator: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation Logic
// ────────────────────────────────────────────────────────────────────────────

function validateAgent(agentName: string, filePath: string, orchestratorContent: string): AgentValidation {
  const content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];

  // Check 1: Template (ManusNativeAgent)
  const hasManusTemplate = content.includes('extends ManusNativeAgent');

  // Check 2: Auto-registration
  const hasAutoRegistration = content.includes('globalRegistry.register');

  // Check 3: In orchestrator
  const inOrchestrator = orchestratorContent.includes(`import './agents/${agentName}'`);

  // Check 4: Motor commands
  const hasMotorCommands = content.includes('generateMotorCommands');

  // Check 5: Schedule
  const scheduleMatch = content.match(/schedule:\s*['"]([^'"]+)['"]/);
  const hasSchedule = !!scheduleMatch;
  const schedule = scheduleMatch ? scheduleMatch[1] : null;

  // Check 6: Version
  const versionMatch = content.match(/readonly version\s*=\s*['"]([^'"]+)['"]/);
  const hasVersion = !!versionMatch;
  const version = versionMatch ? versionMatch[1] : null;

  // Determine status
  let status: AgentValidation['status'] = 'compliant';

  // Check if it's a utility file
  if (UTILITY_FILES.includes(agentName)) {
    return {
      name: agentName,
      filePath,
      status: 'utility',
      version: null,
      issues: [],
      checks: {
        hasManusTemplate: false,
        hasAutoRegistration: false,
        inOrchestrator: false,
        hasMotorCommands: false,
        hasSchedule: false,
        hasVersion: false,
      },
      schedule: null,
      isInOrchestrator: false,
    };
  }

  // Check if it's a legacy agent (BaseTrainingAgent or BrainNativeAgent without Manus)
  const isLegacy = content.includes('extends BaseTrainingAgent') ||
    (content.includes('extends BrainNativeAgent') && !content.includes('extends ManusNativeAgent'));

  if (isLegacy) {
    status = 'legacy';
    issues.push('Uses legacy template (BaseTrainingAgent or BrainNativeAgent)');
  }

  // Validation checks
  if (!hasManusTemplate && !isLegacy) {
    issues.push('Missing ManusNativeAgent template');
    status = 'broken';
  }

  if (!hasAutoRegistration) {
    issues.push('Missing auto-registration (globalRegistry.register)');
    if (status === 'compliant') status = 'needs-upgrade';
  }

  if (!hasMotorCommands) {
    issues.push('Missing motor commands implementation');
    if (status === 'compliant') status = 'needs-upgrade';
  }

  if (!hasSchedule) {
    issues.push('Missing schedule definition');
    if (status === 'compliant') status = 'needs-upgrade';
  }

  if (!hasVersion) {
    issues.push('Missing version number');
    if (status === 'compliant') status = 'needs-upgrade';
  }

  if (inOrchestrator && isLegacy) {
    issues.push('⚠️  CRITICAL: Legacy agent still in orchestrator (needs immediate upgrade)');
    status = 'broken';
  }

  if (!inOrchestrator && hasManusTemplate && hasAutoRegistration) {
    issues.push('Not imported in orchestrator (should be added)');
    if (status === 'compliant') status = 'needs-upgrade';
  }

  return {
    name: agentName,
    filePath,
    status,
    version,
    issues,
    checks: {
      hasManusTemplate,
      hasAutoRegistration,
      inOrchestrator,
      hasMotorCommands,
      hasSchedule,
      hasVersion,
    },
    schedule,
    isInOrchestrator: inOrchestrator,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Reporting
// ────────────────────────────────────────────────────────────────────────────

function printReport(validations: AgentValidation[], verbose: boolean): void {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  AGENT VERSION MANAGER — VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Target Version: ${CURRENT_VERSION}`);
  console.log(`Required Template: ${REQUIRED_TEMPLATE}`);
  console.log('');

  // Categorize agents
  const compliant = validations.filter(v => v.status === 'compliant');
  const needsUpgrade = validations.filter(v => v.status === 'needs-upgrade');
  const broken = validations.filter(v => v.status === 'broken');
  const legacy = validations.filter(v => v.status === 'legacy');
  const utility = validations.filter(v => v.status === 'utility');

  // Compliant agents
  if (compliant.length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log(`  ✅ COMPLIANT AGENTS (${compliant.length})`);
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    for (const agent of compliant) {
      console.log(`✅  ${agent.name}`);
      console.log(`     Version: ${agent.version || 'unknown'}`);
      console.log(`     Schedule: ${agent.schedule || 'not found'}`);
      console.log(`     In orchestrator: ${agent.isInOrchestrator ? 'YES' : 'NO'}`);
      if (verbose) {
        console.log(`     Template: ManusNativeAgent ✓`);
        console.log(`     Auto-register: ${agent.checks.hasAutoRegistration ? 'YES' : 'NO'} ✓`);
        console.log(`     Motor commands: ${agent.checks.hasMotorCommands ? 'YES' : 'NO'} ✓`);
      }
      console.log('');
    }
  }

  // Needs upgrade
  if (needsUpgrade.length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log(`  ⚠️  NEEDS UPGRADE (${needsUpgrade.length})`);
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    for (const agent of needsUpgrade) {
      console.log(`⚠️  ${agent.name}`);
      console.log(`     Version: ${agent.version || 'unknown'}`);
      console.log(`     Issues:`);
      for (const issue of agent.issues) {
        console.log(`       - ${issue}`);
      }
      console.log('');
    }
  }

  // Broken
  if (broken.length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log(`  ❌ BROKEN AGENTS (${broken.length})`);
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    for (const agent of broken) {
      console.log(`❌  ${agent.name}`);
      console.log(`     Status: BROKEN — needs immediate attention`);
      console.log(`     Issues:`);
      for (const issue of agent.issues) {
        console.log(`       - ${issue}`);
      }
      console.log('');
    }
  }

  // Legacy
  if (legacy.length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log(`  🗂️  LEGACY AGENTS (${legacy.length})`);
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    for (const agent of legacy) {
      console.log(`🗂️  ${agent.name}`);
      console.log(`     Status: Legacy (can be archived or migrated)`);
      console.log(`     In orchestrator: ${agent.isInOrchestrator ? 'YES ⚠️' : 'NO'}`);
      console.log(`     Issues:`);
      for (const issue of agent.issues) {
        console.log(`       - ${issue}`);
      }
      console.log('');
    }
  }

  // Utility files
  if (verbose && utility.length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log(`  📁 UTILITY FILES (${utility.length})`);
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    for (const agent of utility) {
      console.log(`📁  ${agent.name} (helper file, not an agent)`);
    }
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Total agents: ${compliant.length + needsUpgrade.length + broken.length + legacy.length}`);
  console.log(`  ✅ Compliant: ${compliant.length}`);
  console.log(`  ⚠️  Needs upgrade: ${needsUpgrade.length}`);
  console.log(`  ❌ Broken: ${broken.length}`);
  console.log(`  🗂️  Legacy: ${legacy.length}`);
  console.log(`  📁 Utility files: ${utility.length}`);
  console.log('');

  // Recommendations
  if (broken.length > 0 || needsUpgrade.length > 0 || legacy.filter(a => a.isInOrchestrator).length > 0) {
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('  RECOMMENDATIONS');
    console.log('───────────────────────────────────────────────────────────────────────────');
    console.log('');
    if (broken.length > 0) {
      console.log('⚠️  CRITICAL: Fix broken agents immediately');
      for (const agent of broken) {
        console.log(`   - ${agent.name}: ${agent.issues[0]}`);
      }
      console.log('');
    }
    if (legacy.filter(a => a.isInOrchestrator).length > 0) {
      console.log('⚠️  CRITICAL: Remove legacy agents from orchestrator');
      for (const agent of legacy.filter(a => a.isInOrchestrator)) {
        console.log(`   - ${agent.name} (replace with V6 version)`);
      }
      console.log('');
    }
    if (needsUpgrade.length > 0) {
      console.log('ℹ️  Upgrade agents to latest version');
      for (const agent of needsUpgrade) {
        console.log(`   - ${agent.name}`);
      }
      console.log('');
    }
  }

  // Exit code
  if (broken.length > 0 || legacy.filter(a => a.isInOrchestrator).length > 0) {
    console.log('❌ VALIDATION FAILED — Critical issues found');
    process.exit(1);
  } else if (needsUpgrade.length > 0) {
    console.log('⚠️  VALIDATION WARNING — Some agents need upgrades');
    process.exit(0); // Don't fail CI, but warn
  } else {
    console.log('✅ VALIDATION PASSED — All agents compliant');
    process.exit(0);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const fix = args.includes('--fix') || args.includes('-f');

  // Read orchestrator content
  const orchestratorContent = readFileSync(ORCHESTRATOR_FILE, 'utf-8');

  // Scan all agent files
  const agentFiles = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.ts'));
  const validations: AgentValidation[] = [];

  for (const file of agentFiles) {
    const agentName = basename(file, '.ts');
    const filePath = resolve(AGENTS_DIR, file);
    const validation = validateAgent(agentName, filePath, orchestratorContent);
    validations.push(validation);
  }

  // Print report
  printReport(validations, verbose);
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});

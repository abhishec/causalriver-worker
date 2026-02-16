#!/usr/bin/env tsx
/**
 * Security Agent Runner — Execute security scans and remediation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   npm run security:scan                    # Full scan + auto-remediation
 *   npm run security:scan -- --dry-run       # Scan only, no fixes
 *   npm run security:scan -- --verbose       # Detailed logging
 *   npm run security:scan -- --no-motor      # Disable motor commands
 *
 * Scans:
 * ------
 * - Supabase RLS policies
 * - SECURITY DEFINER functions
 * - SQL injection patterns
 * - Hardcoded secrets
 * - API security (CORS, rate limits, auth)
 * - Dependency vulnerabilities (npm audit)
 * - Compliance (GDPR, SOC2, OWASP)
 * - AWS infrastructure (if configured)
 *
 * Auto-Remediation:
 * -----------------
 * - Creates migration files for RLS fixes
 * - Generates PRs for code vulnerabilities
 * - Sends Slack alerts for critical issues
 * - Rotates compromised credentials (manual approval)
 *
 */

import dotenv from 'dotenv';
import * as path from 'path';

// Load environment FIRST (before any imports that use env vars)
const envPath = path.join(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  // .env file is optional in CI — secrets come from environment
  if (process.env.CI) {
    console.log('ℹ️  No .env file found (CI environment — using injected secrets)');
  } else {
    console.error('Failed to load .env file:', result.error);
  }
}

// Debug: Check if vars loaded
console.log('DEBUG: Environment loading...');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ SET' : '✗ NOT SET');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ SET' : '✗ NOT SET');
console.log('  DEFAULT_ORG_ID:', process.env.DEFAULT_ORG_ID || '(using default)');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ ERROR: Missing required environment variables');
  console.error('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('');
  console.error('   For local development: Add them to .env file');
  console.error(`   Tried loading from: ${envPath}`);
  console.error(`   File exists: ${require('fs').existsSync(envPath) ? 'YES' : 'NO'}`);
  console.error('');
  console.error('   For CI/CD: Add them as repository secrets');
  console.error('   Settings → Secrets and variables → Actions');
  process.exit(1);
}

import { SecurityHardeningAgent } from './agents/security-hardening-agent';
import type { BrainNativeAgentConfig } from './agent-framework/brain-native-agent-template';
import type { ManusCapabilitiesConfig } from './agent-framework/brain-native-agent-v5-manus';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const noMotor = process.argv.includes('--no-motor');
const scanOnly = process.argv.includes('--scan-only');

const config: BrainNativeAgentConfig & ManusCapabilitiesConfig = {
  organizationId: process.env.DEFAULT_ORG_ID || '00000000-0000-4000-a000-000000000001',
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, // Note: BaseTrainingAgent expects 'supabaseKey'
  dryRun: isDryRun || scanOnly,
  verbose: isVerbose,
  brainRegionConfig: {
    enableAll: true,
    verbose: isVerbose,
  },
  enableMotorCommands: !noMotor && !scanOnly,
  enableCalibration: true,
  enableAgentRegistry: true,
  motorCommandAutoExecuteThreshold: 0.9, // Auto-patch high-confidence fixes
};

// ═══════════════════════════════════════════════════════════════════════════
// BANNER
// ═══════════════════════════════════════════════════════════════════════════

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                   NEXUSBRAIN SECURITY HARDENING AGENT                     ║
║                                                                           ║
║  Brain Region: Amygdala (Threat Detection & Response)                    ║
║  Mode: ${isDryRun ? 'DRY RUN (scan only)' : 'ACTIVE (scan + auto-patch)'}                                   ║
║  Motor Commands: ${config.enableMotorCommands ? 'ENABLED' : 'DISABLED'}                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

if (!config.supabaseUrl || !config.supabaseKey) {
  console.error('❌ ERROR: Missing required environment variables');
  console.error('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN AGENT
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();

  try {
    const agent = new SecurityHardeningAgent(config);

    console.log('🔍 Starting security scan...\n');

    const result = await agent.run();

    const durationSec = ((result.completedAt.getTime() - result.startedAt.getTime()) / 1000).toFixed(1);

    // ── Results Summary ──

    console.log('\n' + '═'.repeat(80));
    console.log('SECURITY SCAN RESULTS');
    console.log('═'.repeat(80));
    console.log(`Duration: ${durationSec}s`);
    console.log(`Signals Generated: ${result.signalsGenerated}`);
    console.log(`Training Packs: ${result.packsProcessed}`);

    // ── Comprehensive Brain Stats ──

    if (result.comprehensiveBrainStats) {
      console.log('\n' + '─'.repeat(80));
      console.log('BRAIN SYSTEMS INITIALIZED');
      console.log('─'.repeat(80));
      console.log(`Total Systems: ${result.comprehensiveBrainStats.totalSystems}`);
      console.log(`Initialized: ${result.comprehensiveBrainStats.initialized}`);
      console.log(`Skipped: ${result.comprehensiveBrainStats.skipped}`);
      console.log(`Failed: ${result.comprehensiveBrainStats.failed}`);
      console.log(`Init Time: ${result.comprehensiveBrainStats.initTimeMs}ms`);
      console.log(`Categories: ${result.comprehensiveBrainStats.categoriesEnabled.join(', ')}`);
    }

    // ── Motor Commands ──

    if (result.motorCommands) {
      console.log('\n' + '─'.repeat(80));
      console.log('MOTOR COMMANDS (AUTO-REMEDIATION)');
      console.log('─'.repeat(80));
      console.log(`Generated: ${result.motorCommands.commandsGenerated}`);
      console.log(`Executed: ${result.motorCommands.commandsExecuted}`);
      console.log(`Failed: ${result.motorCommands.commandsFailed}`);
      console.log(`Pending Approval: ${result.motorCommands.commandsPendingApproval}`);

      if (result.motorCommands.executionDetails.length > 0 && isVerbose) {
        console.log('\nExecution Details:');
        for (const cmd of result.motorCommands.executionDetails) {
          console.log(`  - ${cmd.commandId}: ${cmd.status} (${cmd.executedAt})`);
          if (cmd.error) {
            console.log(`    Error: ${cmd.error}`);
          }
        }
      }
    }

    // ── Calibration ──

    if (result.calibration) {
      console.log('\n' + '─'.repeat(80));
      console.log('CALIBRATION METRICS');
      console.log('─'.repeat(80));
      console.log(`Total Predictions: ${result.calibration.totalPredictions}`);
      console.log(`Verified: ${result.calibration.verifiedPredictions}`);
      console.log(`Correct: ${result.calibration.correctPredictions}`);
      console.log(`Accuracy: ${(result.calibration.accuracy * 100).toFixed(1)}%`);

      if (result.calibration.calibrationCurve.length > 0 && isVerbose) {
        console.log('\nCalibration Curve:');
        for (const bucket of result.calibration.calibrationCurve) {
          console.log(`  ${bucket.confidenceBucket}: predicted=${(bucket.predictedProbability * 100).toFixed(0)}%, actual=${(bucket.actualFrequency * 100).toFixed(0)}% (n=${bucket.count})`);
        }
      }
    }

    // ── Brain Health ──

    if (result.brainHealth) {
      console.log('\n' + '─'.repeat(80));
      console.log('BRAIN HEALTH');
      console.log('─'.repeat(80));
      console.log(`Overall Health: ${result.brainHealth.overallHealth}`);
      console.log(`Agent Status: ${result.brainHealth.agentStatus}`);
      console.log(`Last Run: ${result.brainHealth.lastRunAt}`);
    }

    // ── Errors ──

    if (result.errorsEncountered.length > 0) {
      console.log('\n' + '─'.repeat(80));
      console.log('ERRORS ENCOUNTERED');
      console.log('─'.repeat(80));
      for (const error of result.errorsEncountered) {
        console.log(`  ❌ ${error}`);
      }
    }

    // ── Next Steps ──

    console.log('\n' + '═'.repeat(80));
    console.log('NEXT STEPS');
    console.log('═'.repeat(80));

    if (isDryRun || scanOnly) {
      console.log('✓ Scan complete (dry run mode)');
      console.log('  Run without --dry-run to enable auto-remediation');
    } else if (result.motorCommands && result.motorCommands.commandsExecuted > 0) {
      console.log('✓ Auto-remediation applied');
      console.log('  Review changes and test thoroughly');
    }

    if (result.motorCommands && result.motorCommands.commandsPendingApproval > 0) {
      console.log(`⚠ ${result.motorCommands.commandsPendingApproval} vulnerabilities require manual approval`);
      console.log('  Check your approval queue for pending actions');
    }

    console.log('\n');

    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    if (isVerbose && error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════════════════════

main();

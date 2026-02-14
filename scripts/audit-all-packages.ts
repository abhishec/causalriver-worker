/**
 * Multi-Package Dependency Security Auditor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Audits all workspace packages for security vulnerabilities
 * Aggregates results across the monorepo
 * Generates comprehensive security report
 *
 * Usage:
 *   npx tsx scripts/audit-all-packages.ts
 *
 * Output:
 *   - Console report
 *   - security-deps-audit.json (for security agent)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface VulnerabilityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

interface AuditResult {
  workspace: string;
  vulnerabilities: VulnerabilityCounts;
  dependencies: number;
  success: boolean;
  error?: string;
}

interface AggregatedResults {
  workspaces: AuditResult[];
  total: VulnerabilityCounts;
  timestamp: string;
  scanDurationMs: number;
}

// Workspaces to audit
const WORKSPACES = [
  'packages/memory-stack',
  'platform',
  // 'website' // Uncomment when website has package.json
];

/**
 * Run npm audit on a single workspace
 */
function auditWorkspace(workspace: string): AuditResult {
  const workspacePath = path.join(process.cwd(), workspace);

  // Check if package.json exists
  if (!fs.existsSync(path.join(workspacePath, 'package.json'))) {
    return {
      workspace,
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: 0,
      success: false,
      error: 'No package.json found'
    };
  }

  try {
    const output = execSync('npm audit --json', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'] // Suppress stderr
    });

    const audit = JSON.parse(output);

    return {
      workspace,
      vulnerabilities: audit.metadata?.vulnerabilities || {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0
      },
      dependencies: audit.metadata?.dependencies || 0,
      success: true
    };
  } catch (error: any) {
    // npm audit returns non-zero exit code when vulnerabilities are found
    // But it still outputs JSON to stdout
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        return {
          workspace,
          vulnerabilities: audit.metadata?.vulnerabilities || {
            info: 0,
            low: 0,
            moderate: 0,
            high: 0,
            critical: 0,
            total: 0
          },
          dependencies: audit.metadata?.dependencies || 0,
          success: true
        };
      } catch (parseError) {
        // JSON parse failed
      }
    }

    return {
      workspace,
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Aggregate results across all workspaces
 */
function aggregateResults(results: AuditResult[]): VulnerabilityCounts {
  return results.reduce(
    (acc, r) => ({
      info: acc.info + r.vulnerabilities.info,
      low: acc.low + r.vulnerabilities.low,
      moderate: acc.moderate + r.vulnerabilities.moderate,
      high: acc.high + r.vulnerabilities.high,
      critical: acc.critical + r.vulnerabilities.critical,
      total: acc.total + r.vulnerabilities.total
    }),
    { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  );
}

/**
 * Format severity with emoji
 */
function severityEmoji(level: string): string {
  const map: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    moderate: '🟡',
    low: '🟢',
    info: 'ℹ️'
  };
  return map[level] || '⚪';
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║           MULTI-PACKAGE DEPENDENCY SECURITY AUDIT                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Auditing ${WORKSPACES.length} workspace(s)...\n`);

  const results: AuditResult[] = [];

  // Audit each workspace
  for (const workspace of WORKSPACES) {
    process.stdout.write(`  Scanning ${workspace}... `);
    const result = auditWorkspace(workspace);
    results.push(result);

    if (result.success) {
      if (result.vulnerabilities.total === 0) {
        console.log('✅ No vulnerabilities');
      } else {
        console.log(`⚠️  ${result.vulnerabilities.total} vulnerabilities`);
      }
    } else {
      console.log(`❌ ${result.error}`);
    }
  }

  const total = aggregateResults(results);
  const durationMs = Date.now() - startTime;

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('  DETAILED RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  for (const result of results) {
    if (!result.success) continue;

    console.log(`📦 ${result.workspace}`);
    console.log(`   Dependencies: ${result.dependencies}`);
    console.log(`   Total Vulnerabilities: ${result.vulnerabilities.total}`);

    if (result.vulnerabilities.total > 0) {
      console.log('   Breakdown:');
      if (result.vulnerabilities.critical > 0) {
        console.log(`     ${severityEmoji('critical')} Critical: ${result.vulnerabilities.critical}`);
      }
      if (result.vulnerabilities.high > 0) {
        console.log(`     ${severityEmoji('high')} High: ${result.vulnerabilities.high}`);
      }
      if (result.vulnerabilities.moderate > 0) {
        console.log(`     ${severityEmoji('moderate')} Moderate: ${result.vulnerabilities.moderate}`);
      }
      if (result.vulnerabilities.low > 0) {
        console.log(`     ${severityEmoji('low')} Low: ${result.vulnerabilities.low}`);
      }
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  AGGREGATED SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log(`  ${severityEmoji('critical')} Critical:  ${total.critical}`);
  console.log(`  ${severityEmoji('high')} High:      ${total.high}`);
  console.log(`  ${severityEmoji('moderate')} Moderate:  ${total.moderate}`);
  console.log(`  ${severityEmoji('low')} Low:       ${total.low}`);
  console.log(`  ${severityEmoji('info')} Info:      ${total.info}`);
  console.log(`  ─────────────────────`);
  console.log(`  📊 Total:     ${total.total}`);
  console.log('');

  // Security score
  let score = 10;
  if (total.critical > 0) score -= 5;
  if (total.high > 0) score -= 3;
  if (total.moderate > 0) score -= 1;

  score = Math.max(0, score);

  console.log(`  Security Score: ${score}/10 ${score >= 9 ? '🟢' : score >= 7 ? '🟡' : '🔴'}`);
  console.log(`  Scan Duration: ${durationMs}ms`);
  console.log('');

  // Recommendations
  if (total.total > 0) {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    if (total.critical > 0 || total.high > 0) {
      console.log('  ⚠️  CRITICAL/HIGH vulnerabilities detected!');
      console.log('');
      console.log('  Fix immediately:');
      console.log('    cd packages/memory-stack && npm audit fix');
      console.log('    cd platform && npm audit fix');
      console.log('');
    }

    if (total.moderate > 0) {
      console.log('  📋 Review moderate vulnerabilities:');
      console.log('    npm audit');
      console.log('');
    }

    console.log('  Update dependencies:');
    console.log('    npm update');
    console.log('    npm outdated');
    console.log('');
  } else {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  ✅ ALL CLEAR - No vulnerabilities detected!');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
  }

  // Write JSON output for security agent
  const output: AggregatedResults = {
    workspaces: results,
    total,
    timestamp: new Date().toISOString(),
    scanDurationMs: durationMs
  };

  fs.writeFileSync(
    'security-deps-audit.json',
    JSON.stringify(output, null, 2)
  );

  console.log('  💾 Results saved to: security-deps-audit.json');
  console.log('');

  // Exit with error if critical or high vulnerabilities found
  if (total.critical > 0 || total.high > 0) {
    console.log('  ❌ Scan failed: Critical or high severity vulnerabilities detected\n');
    process.exit(1);
  } else {
    console.log('  ✅ Scan completed successfully\n');
    process.exit(0);
  }
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

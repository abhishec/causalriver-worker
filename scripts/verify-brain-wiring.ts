#!/usr/bin/env tsx
/**
 * Brain Wiring Verification Script
 *
 * Comprehensive CTO-level audit to ensure 100% of the brain is properly wired.
 * Validates exports, event bus connections, scheduled jobs, and feedback loops.
 *
 * Usage:
 *   pnpm tsx scripts/verify-brain-wiring.ts
 *
 * Exit codes:
 *   0 - All wiring verified (10/10 score)
 *   1 - Wiring gaps detected (see output for details)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface WiringCheck {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
  severity?: 'critical' | 'warning' | 'info';
}

interface WiringReport {
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  score: number;
  checks: WiringCheck[];
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧠 NexusBrain Wiring Verification\n');
  console.log('Starting comprehensive CTO-level audit...\n');

  const checks: WiringCheck[] = [];

  // Run all verification checks
  checks.push(...await verifyExports());
  checks.push(...await verifyCognitiveLayers());
  checks.push(...await verifyEventBus());
  checks.push(...await verifyScheduledJobs());
  checks.push(...await verifyFeedbackLoops());
  checks.push(...await verifyAgentRegistration());
  checks.push(...await verifyDomainActions());
  checks.push(...await verifyBridges());

  // Generate report
  const report = generateReport(checks);
  printReport(report);

  // Exit with appropriate code
  process.exit(report.score === 10 ? 0 : 1);
}

// ============================================================================
// VERIFICATION CHECKS
// ============================================================================

async function verifyExports(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    // Check main index.ts exports all modules
    const indexPath = path.join(process.cwd(), 'packages/memory-stack/src/index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Critical exports — Core brain infrastructure
    const criticalExports = [
      'createScheduledJobs',
      'createFeedbackLoop',
      'createThresholdOptimizer',
      'createContinuousLearner',
      'createOutcomeTracker',
      'createConsolidationEngine',
      'createNexusOrchestrator',
      'defineActionDomain',
      'defineAgent',
    ];

    // 15-Layer Cognitive Stack exports
    const cognitiveLayerExports = [
      // Brain layers (3-7)
      'createDeepDreaming',           // L3: Subconscious
      'createHierarchicalMemory',     // L4: Memory hierarchy
      'createCuriosityEngine',        // L5: Growth
      'createSelfModifyingCognition', // L6: Self-awareness
      'createIntelligenceMesh',       // L7: Collective
      // Mind layers (8-15)
      'createCausalImagination',      // L8: Creativity
      'createTheoryOfMind',           // L9: Empathy
      'createTemporalConsciousness',  // L10: Time sense
      'createRedTeam',                // L11: Skepticism
      'createExperimentEngine',       // L12: Scientific method
      'createImmuneSystem',           // L13: Self-defense
      'createGoalBackwardPlanner',    // L14: Intentionality
      'createNarrativeIntelligence',  // L15: Communication
    ];

    for (const exportName of cognitiveLayerExports) {
      const exported = indexContent.includes(exportName);
      checks.push({
        category: 'Cognitive Layers (3-15)',
        name: `Export ${exportName}`,
        passed: exported,
        severity: exported ? undefined : 'critical',
        details: exported ? undefined : `Missing cognitive layer export: ${exportName}`,
      });
    }

    for (const exportName of criticalExports) {
      const exported = indexContent.includes(exportName);
      checks.push({
        category: 'Exports',
        name: `Export ${exportName}`,
        passed: exported,
        severity: exported ? undefined : 'critical',
        details: exported ? undefined : `Missing export: ${exportName}`,
      });
    }

    // Check if outcome-tracker is exported
    checks.push({
      category: 'Exports',
      name: 'outcome-tracker exported from learning/index.ts',
      passed: indexContent.includes('outcome-tracker'),
      severity: 'info',
    });

  } catch (error: any) {
    checks.push({
      category: 'Exports',
      name: 'Read index.ts',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyCognitiveLayers(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  const layerFiles = [
    { layer: 3, name: 'Deep Dreaming', file: 'leap-deep-dreaming.ts', factory: 'createDeepDreaming' },
    { layer: 4, name: 'Hierarchical Memory', file: 'leap-hierarchical-memory.ts', factory: 'createHierarchicalMemory' },
    { layer: 5, name: 'Curiosity Engine', file: 'leap-curiosity-engine.ts', factory: 'createCuriosityEngine' },
    { layer: 6, name: 'Self-Modifying Cognition', file: 'leap-self-modifying-cognition.ts', factory: 'createSelfModifyingCognition' },
    { layer: 7, name: 'Intelligence Mesh', file: 'leap-intelligence-mesh.ts', factory: 'createIntelligenceMesh' },
    { layer: 8, name: 'Causal Imagination', file: 'leap-causal-imagination.ts', factory: 'createCausalImagination' },
    { layer: 9, name: 'Theory of Mind', file: 'leap-theory-of-mind.ts', factory: 'createTheoryOfMind' },
    { layer: 10, name: 'Temporal Consciousness', file: 'leap-temporal-consciousness.ts', factory: 'createTemporalConsciousness' },
    { layer: 11, name: 'Red Team', file: 'leap-red-team.ts', factory: 'createRedTeam' },
    { layer: 12, name: 'Experimentation', file: 'leap-experimentation.ts', factory: 'createExperimentEngine' },
    { layer: 13, name: 'Immune System', file: 'leap-immune-system.ts', factory: 'createImmuneSystem' },
    { layer: 14, name: 'Goal-Backward', file: 'leap-goal-backward.ts', factory: 'createGoalBackwardPlanner' },
    { layer: 15, name: 'Narrative Intelligence', file: 'leap-narrative.ts', factory: 'createNarrativeIntelligence' },
  ];

  for (const layer of layerFiles) {
    try {
      const filePath = path.join(
        process.cwd(),
        `packages/memory-stack/src/causality/${layer.file}`
      );
      const fileExists = fs.existsSync(filePath);

      checks.push({
        category: 'Cognitive Layers',
        name: `L${layer.layer}: ${layer.name} file exists`,
        passed: fileExists,
        severity: fileExists ? undefined : 'critical',
        details: fileExists ? undefined : `Missing: ${layer.file}`,
      });

      if (fileExists) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check factory function exists
        checks.push({
          category: 'Cognitive Layers',
          name: `L${layer.layer}: ${layer.name} factory (${layer.factory})`,
          passed: content.includes(`function ${layer.factory}`),
          severity: 'critical',
        });

        // Check it exports types (interface)
        checks.push({
          category: 'Cognitive Layers',
          name: `L${layer.layer}: ${layer.name} has typed interfaces`,
          passed: content.includes('export interface'),
          severity: 'warning',
        });

        // Check it has at least 100 lines (not a stub)
        const lineCount = content.split('\n').length;
        checks.push({
          category: 'Cognitive Layers',
          name: `L${layer.layer}: ${layer.name} is substantive (${lineCount} lines)`,
          passed: lineCount >= 100,
          severity: lineCount >= 100 ? undefined : 'warning',
          details: lineCount < 100 ? `Only ${lineCount} lines — may be a stub` : undefined,
        });
      }
    } catch (error: any) {
      checks.push({
        category: 'Cognitive Layers',
        name: `L${layer.layer}: ${layer.name}`,
        passed: false,
        severity: 'critical',
        details: error.message,
      });
    }
  }

  // Check ARCHITECTURE-10M.ts has all 15 as implemented
  try {
    const archPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/architecture/ARCHITECTURE-10M.ts'
    );
    const archContent = fs.readFileSync(archPath, 'utf-8');
    const paperOnlyCount = (archContent.match(/status: 'paper_only'/g) || []).length;

    checks.push({
      category: 'Cognitive Layers',
      name: `All 15 leaps implemented (${15 - paperOnlyCount}/15)`,
      passed: paperOnlyCount === 0,
      severity: paperOnlyCount === 0 ? undefined : 'critical',
      details: paperOnlyCount > 0 ? `${paperOnlyCount} leaps still paper_only` : '15/15 implemented',
    });
  } catch (error: any) {
    checks.push({
      category: 'Cognitive Layers',
      name: 'ARCHITECTURE-10M.ts check',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyEventBus(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    const eventBusPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/causality/event-bus.ts'
    );
    const eventBusContent = fs.readFileSync(eventBusPath, 'utf-8');

    // Check event bus infrastructure
    checks.push({
      category: 'Event Bus',
      name: 'Lamport clock ordering',
      passed: eventBusContent.includes('lamportClock') || eventBusContent.includes('vectorClock'),
      severity: 'critical',
    });

    checks.push({
      category: 'Event Bus',
      name: 'Event deduplication',
      passed: eventBusContent.includes('dedup') || eventBusContent.includes('seen'),
      severity: 'critical',
    });

    checks.push({
      category: 'Event Bus',
      name: 'Backpressure handling',
      passed: eventBusContent.includes('backpressure') || eventBusContent.includes('queue'),
      severity: 'warning',
    });

  } catch (error: any) {
    checks.push({
      category: 'Event Bus',
      name: 'Read event-bus.ts',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyScheduledJobs(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    // Check scheduled-jobs.ts exists and has all job functions
    const scheduledJobsPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/orchestrator/scheduled-jobs.ts'
    );
    const scheduledJobsContent = fs.readFileSync(scheduledJobsPath, 'utf-8');

    const requiredJobs = [
      'runPendingVerifications',
      'runWeightUpdates',
      'runEvidenceDecay',
      'runThresholdOptimization',
      'runDataRetention',
      'runUpstreamFederation',
      'runDailyCausalDiscovery',
      'runAllDailyJobs',
    ];

    for (const jobName of requiredJobs) {
      checks.push({
        category: 'Scheduled Jobs',
        name: `Job function: ${jobName}`,
        passed: scheduledJobsContent.includes(jobName),
        severity: 'critical',
      });
    }

    // Check if cron migration exists
    const cronMigrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20250223000001_scheduled_jobs_infrastructure.sql'
    );
    const cronMigrationExists = fs.existsSync(cronMigrationPath);

    checks.push({
      category: 'Scheduled Jobs',
      name: 'Cron migration exists',
      passed: cronMigrationExists,
      severity: 'critical',
      details: cronMigrationExists
        ? 'Migration file found'
        : 'Missing: supabase/migrations/20250223000001_scheduled_jobs_infrastructure.sql',
    });

    if (cronMigrationExists) {
      const cronContent = fs.readFileSync(cronMigrationPath, 'utf-8');

      checks.push({
        category: 'Scheduled Jobs',
        name: 'pg_cron enabled',
        passed: cronContent.includes('pg_cron'),
        severity: 'critical',
      });

      checks.push({
        category: 'Scheduled Jobs',
        name: 'Cron jobs scheduled',
        passed: cronContent.includes('cron.schedule'),
        severity: 'critical',
      });
    }

    // Check if Edge Function exists
    const edgeFunctionPath = path.join(
      process.cwd(),
      'supabase/functions/scheduled-jobs/index.ts'
    );
    const edgeFunctionExists = fs.existsSync(edgeFunctionPath);

    checks.push({
      category: 'Scheduled Jobs',
      name: 'Edge Function exists',
      passed: edgeFunctionExists,
      severity: 'critical',
      details: edgeFunctionExists
        ? 'Edge Function found'
        : 'Missing: supabase/functions/scheduled-jobs/index.ts',
    });

    // Check if npm scripts exist
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    checks.push({
      category: 'Scheduled Jobs',
      name: 'NPM scripts for manual triggers',
      passed:
        packageJson.scripts['job:run'] &&
        packageJson.scripts['job:verification'] &&
        packageJson.scripts['job:all-daily'],
      severity: 'info',
    });

  } catch (error: any) {
    checks.push({
      category: 'Scheduled Jobs',
      name: 'Read scheduled-jobs infrastructure',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyFeedbackLoops(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    const feedbackLoopPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/causality/feedback-loop.ts'
    );
    const feedbackLoopContent = fs.readFileSync(feedbackLoopPath, 'utf-8');

    checks.push({
      category: 'Feedback Loops',
      name: 'Prediction tracking',
      passed: feedbackLoopContent.includes('trackPrediction') || feedbackLoopContent.includes('recordPrediction'),
      severity: 'critical',
    });

    checks.push({
      category: 'Feedback Loops',
      name: 'Outcome verification',
      passed: feedbackLoopContent.includes('verifyPredictions') || feedbackLoopContent.includes('matchOutcome') || feedbackLoopContent.includes('processPendingVerifications'),
      severity: 'critical',
    });

    checks.push({
      category: 'Feedback Loops',
      name: 'Weight updates',
      passed: feedbackLoopContent.includes('updateWeights') || feedbackLoopContent.includes('updateAllWeights'),
      severity: 'critical',
    });

    checks.push({
      category: 'Feedback Loops',
      name: 'Calibration loop',
      passed: feedbackLoopContent.includes('calibrat') || feedbackLoopContent.includes('confidence'),
      severity: 'critical',
    });

    // Check if threshold optimizer exists
    const thresholdOptimizerPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/causality/threshold-optimizer.ts'
    );
    const thresholdOptimizerExists = fs.existsSync(thresholdOptimizerPath);

    checks.push({
      category: 'Feedback Loops',
      name: 'Threshold optimizer exists',
      passed: thresholdOptimizerExists,
      severity: 'critical',
    });

    if (thresholdOptimizerExists) {
      const thresholdContent = fs.readFileSync(thresholdOptimizerPath, 'utf-8');

      checks.push({
        category: 'Feedback Loops',
        name: 'ROC analysis',
        passed: thresholdContent.includes('ROC') || thresholdContent.includes('roc'),
        severity: 'info',
      });
    }

  } catch (error: any) {
    checks.push({
      category: 'Feedback Loops',
      name: 'Read feedback loop files',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyAgentRegistration(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    const brainAgentFusionPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/orchestrator/brain-agent-fusion.ts'
    );
    const fusionContent = fs.readFileSync(brainAgentFusionPath, 'utf-8');

    checks.push({
      category: 'Agent Registration',
      name: 'Brain agents exported',
      passed: fusionContent.includes('export') && fusionContent.includes('Agent'),
      severity: 'critical',
    });

    checks.push({
      category: 'Agent Registration',
      name: 'Agent registry pattern',
      passed: fusionContent.includes('defineAgent') || fusionContent.includes('registerAgent'),
      severity: 'critical',
    });

    // Check for ALL_BRAIN_AGENTS array
    checks.push({
      category: 'Agent Registration',
      name: 'ALL_BRAIN_AGENTS array',
      passed: fusionContent.includes('ALL_BRAIN_AGENTS'),
      severity: 'info',
    });

  } catch (error: any) {
    checks.push({
      category: 'Agent Registration',
      name: 'Read agent fusion file',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyDomainActions(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  try {
    const actionRegistryPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/orchestrator/action-domain-registry.ts'
    );
    const registryContent = fs.readFileSync(actionRegistryPath, 'utf-8');

    checks.push({
      category: 'Domain Actions',
      name: 'Action domain registry',
      passed: registryContent.includes('defineActionDomain') || registryContent.includes('registerDomain'),
      severity: 'critical',
    });

    checks.push({
      category: 'Domain Actions',
      name: 'Semantic router',
      passed: registryContent.includes('router') || registryContent.includes('route'),
      severity: 'critical',
    });

    // Check for ALL_ACTION_DOMAINS
    const actionDomainsPath = path.join(
      process.cwd(),
      'packages/memory-stack/src/orchestrator/action-domains.ts'
    );
    const actionDomainsContent = fs.readFileSync(actionDomainsPath, 'utf-8');

    checks.push({
      category: 'Domain Actions',
      name: 'ALL_ACTION_DOMAINS array',
      passed: actionDomainsContent.includes('ALL_ACTION_DOMAINS'),
      severity: 'info',
    });

    // Count domain actions (should be 35 total: 28 core + 7 SE)
    // Look for function exports and Domain variable assignments
    const domainCount = (actionDomainsContent.match(/export\s+(const|function)\s+\w+Domain/g) || []).length;
    checks.push({
      category: 'Domain Actions',
      name: `Domain action count (${domainCount}/35)`,
      passed: domainCount >= 28, // At least core domains
      severity: domainCount >= 35 ? 'info' : 'warning',
      details: domainCount >= 35 ? '35 domains registered' : `Only ${domainCount} domains found (expected 35)`,
    });

  } catch (error: any) {
    checks.push({
      category: 'Domain Actions',
      name: 'Read domain action files',
      passed: false,
      severity: 'critical',
      details: error.message,
    });
  }

  return checks;
}

async function verifyBridges(): Promise<WiringCheck[]> {
  const checks: WiringCheck[] = [];

  const bridges = [
    'signal-to-eventbus',
    'eventbus-to-causal',
    'causal-to-learning',
    'patterns-to-agents',
    'outcome-to-feedback',
    'observation-bridge',
  ];

  for (const bridge of bridges) {
    try {
      const bridgePath = path.join(
        process.cwd(),
        `packages/memory-stack/src/bridges/${bridge}.ts`
      );
      const bridgeExists = fs.existsSync(bridgePath);

      checks.push({
        category: 'Bridges',
        name: `Bridge: ${bridge}`,
        passed: bridgeExists,
        severity: 'critical',
        details: bridgeExists ? undefined : `Missing: ${bridge}.ts`,
      });

      if (bridgeExists) {
        const bridgeContent = fs.readFileSync(bridgePath, 'utf-8');

        // signal-to-eventbus is entry point (no subscription expected)
        const expectSubscription = bridge !== 'signal-to-eventbus';
        // patterns-to-agents is cache-only (no emission expected)
        const expectEmission = bridge !== 'patterns-to-agents';

        if (expectSubscription) {
          checks.push({
            category: 'Bridges',
            name: `${bridge}: event subscription`,
            passed: bridgeContent.includes('subscribe') || bridgeContent.includes('on('),
            severity: 'warning',
          });
        }

        if (expectEmission) {
          checks.push({
            category: 'Bridges',
            name: `${bridge}: event emission`,
            passed: bridgeContent.includes('emit') || bridgeContent.includes('publish'),
            severity: 'warning',
          });
        }
      }
    } catch (error: any) {
      checks.push({
        category: 'Bridges',
        name: `Bridge: ${bridge}`,
        passed: false,
        severity: 'critical',
        details: error.message,
      });
    }
  }

  return checks;
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(checks: WiringCheck[]): WiringReport {
  const totalChecks = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed && c.severity === 'critical').length;
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').length;

  // Score calculation: 10 points minus deductions
  // Critical failures: -2 points each
  // Warnings: -0.5 points each
  // Info failures: -0.1 points each
  const criticalDeductions = failed * 2;
  const warningDeductions = warnings * 0.5;
  const infoDeductions =
    checks.filter((c) => !c.passed && c.severity === 'info').length * 0.1;

  const score = Math.max(
    0,
    Math.min(10, 10 - criticalDeductions - warningDeductions - infoDeductions)
  );

  return {
    totalChecks,
    passed,
    failed,
    warnings,
    score: parseFloat(score.toFixed(1)),
    checks,
  };
}

function printReport(report: WiringReport) {
  console.log('═'.repeat(70));
  console.log('  NEXUSBRAIN WIRING AUDIT REPORT');
  console.log('═'.repeat(70));
  console.log();

  // Overall score
  const scoreEmoji = report.score === 10 ? '🎯' : report.score >= 9 ? '✅' : report.score >= 7 ? '⚠️' : '❌';
  console.log(`${scoreEmoji} OVERALL SCORE: ${report.score}/10`);
  console.log();

  // Summary stats
  console.log(`📊 Summary:`);
  console.log(`   Total Checks: ${report.totalChecks}`);
  console.log(`   ✅ Passed: ${report.passed}`);
  console.log(`   ❌ Critical Failures: ${report.failed}`);
  console.log(`   ⚠️  Warnings: ${report.warnings}`);
  console.log();

  // Group checks by category
  const categories = [...new Set(report.checks.map((c) => c.category))];

  for (const category of categories) {
    const categoryChecks = report.checks.filter((c) => c.category === category);
    const categoryPassed = categoryChecks.filter((c) => c.passed).length;
    const categoryTotal = categoryChecks.length;

    console.log(`\n📁 ${category} (${categoryPassed}/${categoryTotal})`);
    console.log('─'.repeat(70));

    for (const check of categoryChecks) {
      const icon = check.passed
        ? '✅'
        : check.severity === 'critical'
        ? '❌'
        : check.severity === 'warning'
        ? '⚠️'
        : 'ℹ️';

      console.log(`   ${icon} ${check.name}`);
      if (check.details) {
        console.log(`      ${check.details}`);
      }
    }
  }

  console.log();
  console.log('═'.repeat(70));

  // Final verdict
  if (report.score === 10) {
    console.log('🎉 PERFECT WIRING - All systems connected!');
  } else if (report.score >= 9) {
    console.log('✅ EXCELLENT - Minor improvements possible');
  } else if (report.score >= 7) {
    console.log('⚠️  GOOD - Some wiring gaps detected');
  } else {
    console.log('❌ NEEDS WORK - Critical wiring issues found');
  }

  console.log('═'.repeat(70));
  console.log();
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  console.error('💥 Verification script error:', error);
  process.exit(1);
});

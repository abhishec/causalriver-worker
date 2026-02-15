#!/usr/bin/env tsx
/**
 * Run Full Brain Consolidation — Direct Node.js Pipeline
 *
 * This script runs the COMPLETE brain pipeline including the cognitive stack
 * (layers 3-15: Deep Dreaming → Narrative Intelligence) via Node.js.
 *
 * WHY THIS EXISTS:
 *   The Supabase Edge Function cron runs "light consolidation" (maintenance,
 *   health snapshot, federation) because it runs in Deno and can't import
 *   Node.js modules. This script runs the FULL pipeline via Node.js which
 *   is the ONLY path to populate cognitive layers L3-L15.
 *
 * WHAT IT DOES:
 *   1. Consolidation Engine (10-step brain sleep)
 *   2. Default Mode Network (background insights)
 *   3. Learning modules (Bayesian + Embedding + Contrastive + Attention)
 *   4. Cognitive Stack L3-L15 (Deep Dreaming, Curiosity, Self-Modifying,
 *      Intelligence Mesh, Causal Imagination, Theory of Mind, Temporal
 *      Consciousness, Red Team, Experimentation, Immune, Goal Planning,
 *      Narrative Intelligence)
 *   5. LEAP state persistence (survives restarts)
 *   6. Layer output persistence to ai_memory + cognitive_leap_state tables
 *
 * USAGE:
 *   # Run for default org (core brain)
 *   pnpm job:full-consolidation
 *
 *   # Run for specific org
 *   ORGANIZATION_ID=your-org-id pnpm job:full-consolidation
 *
 *   # Verbose mode
 *   VERBOSE=true pnpm job:full-consolidation
 *
 * SCHEDULING:
 *   Runs automatically via .github/workflows/brain-consolidation.yml (2 AM UTC)
 *   Can also be triggered manually or via the brain-consolidation-runner.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file not found — rely on environment variables
  }
}
loadEnv();

// ── NexusBrain Imports ──
import { createBrainPipeline } from '../packages/memory-stack/src/orchestrator/brain-pipeline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || CORE_BRAIN_ORG_ID;
const VERBOSE = process.env.VERBOSE === 'true';

// ============================================================================
// LOGGING
// ============================================================================

function log(stage: string, message: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [${stage}] ${message}`);
}

function logError(stage: string, message: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [${stage}] ERROR: ${message}`);
  if (err instanceof Error) console.error(`  ${err.message}`);
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  if (!SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL is not set.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Verify connection
  try {
    const { error } = await supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR: Cannot connect to Supabase.');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }

  divider('NEXUSBRAIN FULL CONSOLIDATION (Brain Pipeline)');
  log('INIT', `Organization: ${ORGANIZATION_ID}`);
  log('INIT', `Verbose: ${VERBOSE}`);
  log('INIT', 'Running brain-pipeline.runFullCycle() → Cognitive Stack L3-L15');

  const startTime = Date.now();

  try {
    const pipeline = createBrainPipeline({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });

    const report = await pipeline.runFullCycle();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    divider('FULL CYCLE REPORT');
    log('RESULT', `Status: ${report.status}`);
    log('RESULT', `Duration: ${duration}s (${report.totalDurationMs}ms pipeline)`);

    // Consolidation stats
    if (report.consolidation) {
      const s = report.consolidation.report.stats;
      log('CONSOLIDATION', `Signals: ${s.signalsProcessed} | Edges: ${s.causalEdgesDiscovered} | New: ${s.newRelationships}`);
      log('CONSOLIDATION', `Pruned: ${s.edgesPruned} | Strengthened: ${s.edgesStrengthened} | Anomalies: ${s.anomaliesDetected}`);
      log('CONSOLIDATION', `Patterns: ${s.patternsFound} | Temporal Rules: ${s.temporalRulesFound}`);
    }

    // DMN stats
    if (report.dmn) {
      log('DMN', `Insights: ${report.dmn.insights?.length ?? 0}`);
    }

    // Learning stats
    if (report.learning) {
      log('LEARNING', `Bayesian updates: ${report.learning.bayesianUpdates ?? 0}`);
    }

    // Cognitive Stack — THE KEY OUTPUT
    log('COGNITIVE', `Cognitive Stack Ran: ${report.cognitiveStack !== null}`);
    if (report.cognitiveStack) {
      const cs = report.cognitiveStack;
      log('COGNITIVE', `  L3  Deep Dreaming:       ${cs.dreaming?.associationsFound ?? 0} associations, ${cs.dreaming?.crossDomainConnections ?? 0} cross-domain`);
      log('COGNITIVE', `  L4  Hierarchical Memory: ${cs.memory?.itemsEncoded ?? 0} items encoded, ${cs.memory?.episodesRecorded ?? 0} episodes`);
      log('COGNITIVE', `  L5  Curiosity:           ${cs.curiosity?.hypothesesGenerated ?? 0} hypotheses, ${cs.curiosity?.knowledgeGaps ?? 0} gaps`);
      log('COGNITIVE', `  L6  Self-Modifying:      ${cs.selfModel?.suggestedModifications ?? 0} modifications, calibration=${(cs.selfModel?.calibrationScore ?? 0).toFixed(2)}`);
      log('COGNITIVE', `  L7  Intelligence Mesh:   ${cs.mesh?.patternsContributed ?? 0} patterns, ${cs.mesh?.collectivePatterns ?? 0} collective`);
      log('COGNITIVE', `  L8  Causal Imagination:  ${cs.imagination?.scenariosPlanned ?? 0} scenarios, ${cs.imagination?.analogiesFound ?? 0} analogies`);
      log('COGNITIVE', `  L9  Theory of Mind:      updated=${cs.theoryOfMind?.userModelUpdated ?? false}, intent="${cs.theoryOfMind?.predictedIntent ?? 'unknown'}"`);
      log('COGNITIVE', `  L10 Temporal:            ${cs.temporal?.rhythmsDetected ?? 0} rhythms, ${cs.temporal?.goalsTracked ?? 0} goals tracked`);
      log('COGNITIVE', `  L11 Red Team:            ${cs.redTeam?.predictionsTested ?? 0} tests, robustness=${(cs.redTeam?.robustnessAvg ?? 0).toFixed(2)}`);
      log('COGNITIVE', `  L12 Experimentation:     ${cs.experimentation?.experimentsSuggested ?? 0} experiments suggested`);
      log('COGNITIVE', `  L13 Immune System:       ${cs.immune?.signalsChecked ?? 0} checked, ${cs.immune?.signalsQuarantined ?? 0} quarantined`);
      log('COGNITIVE', `  L14 Goal Planning:       ${cs.planning?.goalsPlanned ?? 0} goals, ${cs.planning?.feasiblePaths ?? 0} feasible paths`);
      log('COGNITIVE', `  L15 Narrative:           ${cs.narrative ? `"${cs.narrative.title}" (${cs.narrative.keyInsights?.length ?? 0} insights)` : 'none generated'}`);
    } else {
      logError('COGNITIVE', 'Cognitive Stack did NOT run — L3-L15 NOT populated!');
    }

    // Errors
    if (report.errors.length > 0) {
      log('WARNINGS', `${report.errors.length} non-fatal errors:`);
      for (const e of report.errors) {
        log('WARNINGS', `  ⚠ ${e}`);
      }
    }

    divider('FULL CONSOLIDATION COMPLETE');
    log('DONE', `Total time: ${duration}s`);
    log('DONE', `Status: ${report.status}`);
    log('DONE', `Cognitive Stack L3-L15: ${report.cognitiveStack ? 'POPULATED ✓' : 'NOT POPULATED ✗'}`);

    // Log the run
    try {
      await supabase.from('scheduled_job_runs').insert({
        organization_id: ORGANIZATION_ID,
        job_name: 'full-consolidation',
        job_type: 'full_consolidation',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        status: report.status === 'failed' ? 'error' : 'success',
        result: JSON.stringify({
          cognitiveStackRan: report.cognitiveStack !== null,
          totalDurationMs: report.totalDurationMs,
          status: report.status,
        }),
        error_message: report.errors.length > 0 ? report.errors.join('; ') : null,
        duration_ms: Date.now() - startTime,
      });
    } catch {
      // Non-critical — logging failure shouldn't fail the job
    }

    process.exit(report.status === 'failed' ? 1 : 0);
  } catch (err) {
    logError('FATAL', 'Full consolidation failed', err);
    process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

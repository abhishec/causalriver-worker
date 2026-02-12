/**
 * NexusBrain Weekly Runner
 *
 * Runs every Sunday — 11-region brain scan + performance benchmarks:
 *   1. Run benchmark suite (Sachs, ALARM, SaaS, Cascade, Anomaly)
 *   2. Evaluate brain maturity across all 11 brain regions
 *   3. Compare with previous week's regional scores
 *   4. Store results for trend tracking
 *   5. Prune edges unvalidated for 60+ days
 *
 * Brain Region Scan:
 *   PERCEPTION:        Sensory Cortex (signal quality)
 *   MEMORY & LEARNING: Hippocampus (causal), Basal Ganglia (patterns), LTP (ML learners)
 *   REASONING:         Prefrontal Cortex (rules), DMN (predictions)
 *   DETECTION:         Thalamus (cascades), Insula (anomalies), Amygdala (impact)
 *   COORDINATION:      Cerebellum (fast-path), Corpus Callosum (federation)
 *
 * Schedule: Every Sunday at 4:00 AM (after nightly cycle completes)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root (zero-dependency, no dotenv needed)
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

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || '00000000-0000-4000-a000-000000000001';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================================
// LOGGING
// ============================================================================

function log(stage: string, msg: string) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [${stage}] ${msg}`);
}

function divider(title: string) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = Date.now();

  // Verify connection
  const { error: connError } = await supabase.from('cross_domain_signals').select('id').limit(1);
  if (connError) {
    console.error('Failed to connect to Supabase:', connError.message);
    process.exit(1);
  }
  log('INIT', 'Supabase connection verified');

  divider('NEXUSBRAIN WEEKLY BRAIN SCAN');
  log('INIT', `Organization: ${ORGANIZATION_ID}`);
  log('INIT', `Date: ${new Date().toISOString().split('T')[0]}`);

  // ═══════════════════════════════════════════════════════
  // STAGE 1: BENCHMARK SUITE (Tests 7 core brain regions)
  // ═══════════════════════════════════════════════════════
  divider('STAGE 1: BENCHMARK SUITE (7 Core Brain Regions)');

  let benchmarkReport: any = null;
  let maturityReport: any = null;
  try {
    const { createBenchmarkRunner } = await import('../packages/memory-stack/src/benchmarks/benchmark-runner');
    const runner = createBenchmarkRunner({
      benchmarks: ['sachs', 'alarm', 'saas', 'cascade', 'anomaly'],
      trainFromResults: false, // Don't retrain during benchmarks — just measure
      trainFromLibrary: false,
      verbose: true,
    });

    benchmarkReport = runner.runFullSuite();

    // The benchmark runner prints its own detailed output including maturity evaluation
    if (benchmarkReport?.maturity) {
      maturityReport = benchmarkReport.maturity;
      log('BENCHMARK', `Brain Maturity: ${maturityReport.overallLevel} (${maturityReport.overallScore}/100)`);
    }
    log('BENCHMARK', 'Benchmark suite complete (details printed above)');
  } catch (err) {
    log('BENCHMARK', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 2: 11-REGION BRAIN SCAN
  // ═══════════════════════════════════════════════════════
  divider('STAGE 2: 11-REGION BRAIN SCAN');

  try {
    if (maturityReport?.regionScores) {
      const regions = maturityReport.regionScores;
      log('SCAN', '');
      log('SCAN', '  PERCEPTION:');
      log('SCAN', `    Sensory Cortex:     ${regions.sensoryCortex?.score ?? 'N/A'}/100 (${regions.sensoryCortex?.level ?? 'N/A'})`);
      log('SCAN', '');
      log('SCAN', '  MEMORY & LEARNING:');
      log('SCAN', `    Hippocampus:        ${regions.hippocampus?.score ?? 'N/A'}/100 (${regions.hippocampus?.level ?? 'N/A'})`);
      log('SCAN', `    Basal Ganglia:      ${regions.basalGanglia?.score ?? 'N/A'}/100 (${regions.basalGanglia?.level ?? 'N/A'})`);
      log('SCAN', `    LTP (Synaptic):     ${regions.ltp?.score ?? 'N/A'}/100 (${regions.ltp?.level ?? 'N/A'})`);
      log('SCAN', '');
      log('SCAN', '  REASONING & PREDICTION:');
      log('SCAN', `    Prefrontal Cortex:  ${regions.prefrontalCortex?.score ?? 'N/A'}/100 (${regions.prefrontalCortex?.level ?? 'N/A'})`);
      log('SCAN', `    DMN:                ${regions.dmn?.score ?? 'N/A'}/100 (${regions.dmn?.level ?? 'N/A'})`);
      log('SCAN', '');
      log('SCAN', '  DETECTION & RESPONSE:');
      log('SCAN', `    Thalamus:           ${regions.thalamus?.score ?? 'N/A'}/100 (${regions.thalamus?.level ?? 'N/A'})`);
      log('SCAN', `    Insula:             ${regions.insula?.score ?? 'N/A'}/100 (${regions.insula?.level ?? 'N/A'})`);
      log('SCAN', `    Amygdala:           ${regions.amygdala?.score ?? 'N/A'}/100 (${regions.amygdala?.level ?? 'N/A'})`);
      log('SCAN', '');
      log('SCAN', '  COORDINATION:');
      log('SCAN', `    Cerebellum:         ${regions.cerebellum?.score ?? 'N/A'}/100 (${regions.cerebellum?.level ?? 'N/A'})`);
      log('SCAN', `    Corpus Callosum:    ${regions.corpusCallosum?.score ?? 'N/A'}/100 (${regions.corpusCallosum?.level ?? 'N/A'})`);
      log('SCAN', '');
      log('SCAN', `  All regions expert: ${maturityReport.allRegionsExpert ? 'YES' : 'NO'}`);
    } else if (maturityReport?.pillarScores) {
      // Fallback: legacy pillar format
      for (const [pillar, data] of Object.entries(maturityReport.pillarScores)) {
        const d = data as any;
        log('SCAN', `  ${pillar}: ${d.score?.toFixed?.(1) ?? 'N/A'}/100 (${d.level ?? 'N/A'})`);
      }
    } else {
      log('SCAN', 'Skipped — no benchmark scores available');
    }
  } catch (err) {
    log('SCAN', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 3: HIPPOCAMPUS PRUNING (60-day stale edges)
  // ═══════════════════════════════════════════════════════
  divider('STAGE 3: HIPPOCAMPUS PRUNING (Stale Edge Removal)');

  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Find edges that haven't been validated in 60 days AND have low evidence weight
    // Note: table uses 'evidence_weight' (default 1.0), not 'confidence'
    const { data: staleEdges, error: staleError } = await supabase
      .from('causal_relationships_statistical')
      .select('id, source_domain, target_domain, evidence_weight, updated_at')
      .eq('organization_id', ORGANIZATION_ID)
      .lt('updated_at', sixtyDaysAgo.toISOString())
      .lt('evidence_weight', 0.3);

    if (staleError) {
      log('PRUNE', `Query failed: ${staleError.message}`);
    } else if (staleEdges && staleEdges.length > 0) {
      log('PRUNE', `Found ${staleEdges.length} stale synapses (>60 days, confidence <0.3)`);

      // Delete stale edges
      const staleIds = staleEdges.map(e => e.id);
      const { error: deleteError } = await supabase
        .from('causal_relationships_statistical')
        .delete()
        .in('id', staleIds);

      if (deleteError) {
        log('PRUNE', `Delete failed: ${deleteError.message}`);
      } else {
        log('PRUNE', `Pruned ${staleEdges.length} stale synapses from Hippocampus`);
        for (const edge of staleEdges.slice(0, 5)) {
          log('PRUNE', `  - ${edge.source_domain} → ${edge.target_domain} (evidence_weight: ${edge.evidence_weight})`);
        }
        if (staleEdges.length > 5) {
          log('PRUNE', `  ... and ${staleEdges.length - 5} more`);
        }
      }
    } else {
      log('PRUNE', 'No stale synapses found — causal graph is healthy');
    }
  } catch (err) {
    log('PRUNE', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 4: BRAIN HEALTH SUMMARY
  // ═══════════════════════════════════════════════════════
  divider('STAGE 4: BRAIN HEALTH SUMMARY');

  try {
    const { count: edgeCount } = await supabase
      .from('causal_relationships_statistical')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    const { count: signalCount } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    const { count: memoryCount } = await supabase
      .from('ai_memory')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    const { count: predictionCount } = await supabase
      .from('prediction_records')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    log('HEALTH', `Hippocampus synapses (causal edges): ${edgeCount ?? 0}`);
    log('HEALTH', `Sensory Cortex signals stored: ${signalCount ?? 0}`);
    log('HEALTH', `Long-term memories: ${memoryCount ?? 0}`);
    log('HEALTH', `DMN predictions: ${predictionCount ?? 0}`);
  } catch (err) {
    log('HEALTH', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // PERSIST WEEKLY BRAIN SCAN
  // ═══════════════════════════════════════════════════════
  const duration = Date.now() - startTime;

  try {
    // Build region scores for storage
    const regionMetrics: Record<string, any> = {};
    if (maturityReport?.regionScores) {
      for (const [key, data] of Object.entries(maturityReport.regionScores)) {
        const d = data as any;
        regionMetrics[key] = { score: d.score, level: d.level };
      }
    }

    await supabase.from('learning_runs').insert({
      organization_id: ORGANIZATION_ID,
      run_type: 'weekly_brain_scan',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      metrics: {
        maturity_level: maturityReport?.overallLevel ?? null,
        maturity_score: maturityReport?.overallScore ?? null,
        all_regions_expert: maturityReport?.allRegionsExpert ?? false,
        region_scores: regionMetrics,
      },
    });
    log('PERSIST', 'Weekly brain scan saved to learning_runs');
  } catch (err) {
    log('PERSIST', `Failed to save: ${err instanceof Error ? err.message : String(err)}`);
  }

  divider('WEEKLY BRAIN SCAN COMPLETE');
  log('DONE', `Total time: ${(duration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Weekly runner failed:', err);
  process.exit(1);
});

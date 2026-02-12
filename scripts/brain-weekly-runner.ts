/**
 * NexusBrain Weekly Runner
 *
 * Runs every Sunday — performance benchmarks + maturity evaluation:
 *   1. Run benchmark suite (Sachs, ALARM, SaaS, Cascade, Anomaly)
 *   2. Evaluate brain maturity across 7 intelligence layers
 *   3. Compare with previous week's scores
 *   4. Store results for trend tracking
 *   5. Prune edges unvalidated for 60+ days
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

  divider('NEXUSBRAIN WEEKLY HEALTH CHECK');
  log('INIT', `Organization: ${ORGANIZATION_ID}`);
  log('INIT', `Date: ${new Date().toISOString().split('T')[0]}`);

  // ═══════════════════════════════════════════════════════
  // STAGE 1: BENCHMARK SUITE
  // ═══════════════════════════════════════════════════════
  divider('STAGE 1: BENCHMARK SUITE');

  let benchmarkReport: any = null;
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
      log('BENCHMARK', `Maturity: ${benchmarkReport.maturity.level} (${benchmarkReport.maturity.overallScore}/100)`);
      maturityReport = benchmarkReport.maturity;
    }
    if (benchmarkReport?.scores) {
      log('BENCHMARK', `Overall score: ${benchmarkReport.scores.overall?.toFixed?.(1) ?? 'N/A'}/100`);
    }
    log('BENCHMARK', 'Benchmark suite complete (details printed above)');
  } catch (err) {
    log('BENCHMARK', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 2: MATURITY EVALUATION
  // ═══════════════════════════════════════════════════════
  divider('STAGE 2: MATURITY EVALUATION');

  let maturityReport: any = null;
  try {
    const { createMaturityEvaluator } = await import('../packages/memory-stack/src/benchmarks/maturity-evaluator');
    const evaluator = createMaturityEvaluator();

    if (benchmarkReport?.scores) {
      maturityReport = evaluator.evaluate(benchmarkReport.scores);
      log('MATURITY', `Level: ${maturityReport.level} (${maturityReport.humanReadable})`);
      log('MATURITY', `Overall score: ${maturityReport.overallScore.toFixed(1)}/100`);

      if (maturityReport.layerScores) {
        for (const [layer, score] of Object.entries(maturityReport.layerScores)) {
          log('MATURITY', `  ${layer}: ${(score as number).toFixed(1)}`);
        }
      }

      log('MATURITY', `All layers expert: ${maturityReport.allLayersExpert ? 'YES' : 'NO'}`);
    } else {
      log('MATURITY', 'Skipped — no benchmark scores available');
    }
  } catch (err) {
    log('MATURITY', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 3: EDGE PRUNING (60-day stale edges)
  // ═══════════════════════════════════════════════════════
  divider('STAGE 3: STALE EDGE PRUNING');

  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Find edges that haven't been validated in 60 days AND have low confidence
    const { data: staleEdges, error: staleError } = await supabase
      .from('causal_relationships_statistical')
      .select('id, source_domain, target_domain, confidence, updated_at')
      .eq('organization_id', ORGANIZATION_ID)
      .lt('updated_at', sixtyDaysAgo.toISOString())
      .lt('confidence', 0.3);

    if (staleError) {
      log('PRUNE', `Query failed: ${staleError.message}`);
    } else if (staleEdges && staleEdges.length > 0) {
      log('PRUNE', `Found ${staleEdges.length} stale edges (>60 days, weight <0.3)`);

      // Delete stale edges
      const staleIds = staleEdges.map(e => e.id);
      const { error: deleteError } = await supabase
        .from('causal_relationships_statistical')
        .delete()
        .in('id', staleIds);

      if (deleteError) {
        log('PRUNE', `Delete failed: ${deleteError.message}`);
      } else {
        log('PRUNE', `Pruned ${staleEdges.length} stale edges`);
        for (const edge of staleEdges.slice(0, 5)) {
          log('PRUNE', `  - ${edge.source_domain} → ${edge.target_domain} (confidence: ${edge.confidence})`);
        }
        if (staleEdges.length > 5) {
          log('PRUNE', `  ... and ${staleEdges.length - 5} more`);
        }
      }
    } else {
      log('PRUNE', 'No stale edges found — graph is healthy');
    }
  } catch (err) {
    log('PRUNE', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 4: GRAPH HEALTH SUMMARY
  // ═══════════════════════════════════════════════════════
  divider('STAGE 4: GRAPH HEALTH SUMMARY');

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

    log('HEALTH', `Causal edges: ${edgeCount ?? 0}`);
    log('HEALTH', `Signals stored: ${signalCount ?? 0}`);
    log('HEALTH', `Memories: ${memoryCount ?? 0}`);
    log('HEALTH', `Predictions: ${predictionCount ?? 0}`);
  } catch (err) {
    log('HEALTH', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // PERSIST WEEKLY REPORT
  // ═══════════════════════════════════════════════════════
  const duration = Date.now() - startTime;

  try {
    await supabase.from('learning_runs').insert({
      organization_id: ORGANIZATION_ID,
      run_type: 'weekly_health_check',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      metrics: {
        benchmark_overall: benchmarkReport?.scores?.overall ?? null,
        maturity_level: maturityReport?.level ?? null,
        maturity_score: maturityReport?.overallScore ?? null,
        all_layers_expert: maturityReport?.allLayersExpert ?? false,
      },
    });
    log('PERSIST', 'Weekly report saved to learning_runs');
  } catch (err) {
    log('PERSIST', `Failed to save: ${err instanceof Error ? err.message : String(err)}`);
  }

  divider('WEEKLY HEALTH CHECK COMPLETE');
  log('DONE', `Total time: ${(duration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Weekly runner failed:', err);
  process.exit(1);
});

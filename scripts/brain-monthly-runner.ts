/**
 * NexusBrain Monthly Runner
 *
 * Runs on the 1st of each month — full historical deep analysis:
 *   1. Hippocampus: Full causal discovery on ALL historical data (not just 48h)
 *   2. LTP: Auto-generate training packs from monthly discoveries
 *   3. Monthly brain growth report (compare with last month)
 *
 * This is the brain's equivalent of a deep sleep cycle —
 * processing ALL accumulated memories to find hidden patterns
 * that the nightly 48h window would miss.
 *
 * Schedule: 1st of each month at 3:00 AM
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

  divider('NEXUSBRAIN MONTHLY DEEP SLEEP CYCLE');
  log('INIT', `Organization: ${ORGANIZATION_ID}`);
  log('INIT', `Month: ${new Date().toISOString().substring(0, 7)}`);

  // ═══════════════════════════════════════════════════════
  // STAGE 1: FULL HISTORICAL CAUSAL DISCOVERY
  // ═══════════════════════════════════════════════════════
  divider('STAGE 1: HIPPOCAMPUS — Full Historical Causal Discovery');

  let discoveryResults: any = null;
  try {
    // Fetch ALL historical signals (not just 48h lookback)
    const { data: allSignals, error: sigError } = await supabase
      .from('cross_domain_signals')
      .select('*')
      .eq('organization_id', ORGANIZATION_ID)
      .order('signal_timestamp', { ascending: true });

    if (sigError) throw new Error(sigError.message);

    log('DISCOVERY', `Loaded ${allSignals?.length ?? 0} total historical signals`);

    if (allSignals && allSignals.length > 0) {
      // Group by domain for discovery
      const domainGroups: Record<string, any[]> = {};
      for (const sig of allSignals) {
        const domain = sig.source_domain || 'unknown';
        if (!domainGroups[domain]) domainGroups[domain] = [];
        domainGroups[domain].push(sig);
      }

      const domains = Object.keys(domainGroups);
      log('DISCOVERY', `Domains: ${domains.join(', ')} (${domains.length} total)`);

      // Run federated causal discovery
      try {
        const { runCausalDiscovery } = await import('../packages/memory-stack/src/causality/causal-discovery-runner');

        // Convert to discovery format
        const signals = allSignals.map(s => ({
          source_domain: s.source_domain,
          target_domain: s.source_domain,
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          timestamp: s.signal_timestamp || s.created_at,
          entity_type: s.entity_type,
          entity_id: s.entity_id,
        }));

        discoveryResults = await runCausalDiscovery(signals, {
          minSampleSize: 20,
          maxLagDays: 90, // Full 90-day lag for monthly (vs 30 for nightly)
          pValueThreshold: 0.05,
        });

        log('DISCOVERY', `Found ${discoveryResults.relationships?.length ?? 0} causal relationships`);
        log('DISCOVERY', `New relationships: ${discoveryResults.newRelationships ?? 0}`);
      } catch (err) {
        log('DISCOVERY', `Causal discovery failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    log('DISCOVERY', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 2: AUTO-GENERATE TRAINING PACKS FROM DISCOVERIES
  // ═══════════════════════════════════════════════════════
  divider('STAGE 2: LTP — Auto-Generate Training Packs');

  try {
    if (discoveryResults?.relationships && discoveryResults.relationships.length > 0) {
      const { createBrainTrainer } = await import('../packages/memory-stack/src/learning/brain-trainer');
      const trainer = createBrainTrainer();

      // Convert discoveries to training edges
      const monthlyPack = {
        id: `monthly-discovery-${new Date().toISOString().substring(0, 7)}`,
        name: `Monthly Discovery ${new Date().toISOString().substring(0, 7)}`,
        description: `Auto-generated from full historical causal discovery`,
        domain: 'cross-domain',
        edges: discoveryResults.relationships.slice(0, 50).map((r: any) => ({
          source: r.source_domain || r.source,
          target: r.target_domain || r.target,
          weight: r.weight || r.confidence || 0.5,
          lag_days: r.lag_days || 0,
          mechanism: r.mechanism || `Monthly discovery: ${r.source} → ${r.target}`,
        })),
        rules: [],
        cascades: [],
        outcomes: [],
        narratives: [],
      };

      const stats = await trainer.train(supabase, ORGANIZATION_ID, monthlyPack);
      log('TRAIN', `Monthly pack trained: ${stats.edgesTrained} edges, ${stats.rulesTrained} rules`);
    } else {
      log('TRAIN', 'No new discoveries to train on');
    }
  } catch (err) {
    log('TRAIN', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // STAGE 3: MONTHLY PROGRESS REPORT
  // ═══════════════════════════════════════════════════════
  divider('STAGE 3: MONTHLY BRAIN GROWTH REPORT');

  try {
    // Count growth over the month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Signals added this month
    const { count: newSignals } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID)
      .gte('created_at', oneMonthAgo.toISOString());

    // Total signals
    const { count: totalSignals } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    // Edges added this month
    const { count: newEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID)
      .gte('created_at', oneMonthAgo.toISOString());

    // Total edges
    const { count: totalEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    // Learning runs this month
    const { count: learningRuns } = await supabase
      .from('learning_runs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID)
      .gte('started_at', oneMonthAgo.toISOString());

    // Memories
    const { count: totalMemories } = await supabase
      .from('ai_memory')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    log('REPORT', '=== Monthly Brain Growth ===');
    log('REPORT', `Sensory Cortex signals: ${newSignals ?? 0} new (${totalSignals ?? 0} total)`);
    log('REPORT', `Hippocampus synapses: ${newEdges ?? 0} new (${totalEdges ?? 0} total)`);
    log('REPORT', `LTP learning runs: ${learningRuns ?? 0} this month`);
    log('REPORT', `Long-term memories: ${totalMemories ?? 0} total`);

    // Store as memory for the brain to reason about
    await supabase.from('ai_memory').insert({
      organization_id: ORGANIZATION_ID,
      memory_type: 'insight',
      content: `Monthly Brain Report (${new Date().toISOString().substring(0, 7)}): ` +
        `${newSignals ?? 0} new signals, ${newEdges ?? 0} new causal edges, ` +
        `${learningRuns ?? 0} learning runs. Total: ${totalSignals ?? 0} signals, ` +
        `${totalEdges ?? 0} edges, ${totalMemories ?? 0} memories.`,
      domain: 'brain-health',
      confidence: 1.0,
      metadata: {
        report_type: 'monthly_growth',
        month: new Date().toISOString().substring(0, 7),
        new_signals: newSignals,
        total_signals: totalSignals,
        new_edges: newEdges,
        total_edges: totalEdges,
        learning_runs: learningRuns,
        total_memories: totalMemories,
      },
    });
    log('REPORT', 'Monthly report saved as brain memory');
  } catch (err) {
    log('REPORT', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ═══════════════════════════════════════════════════════
  // PERSIST
  // ═══════════════════════════════════════════════════════
  const duration = Date.now() - startTime;

  try {
    await supabase.from('learning_runs').insert({
      organization_id: ORGANIZATION_ID,
      run_type: 'monthly_deep_analysis',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: duration,
      metrics: {
        discovery_relationships: discoveryResults?.relationships?.length ?? 0,
        new_relationships: discoveryResults?.newRelationships ?? 0,
      },
    });
    log('PERSIST', 'Monthly report saved to learning_runs');
  } catch (err) {
    log('PERSIST', `Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  divider('MONTHLY DEEP SLEEP CYCLE COMPLETE');
  log('DONE', `Total time: ${(duration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Monthly runner failed:', err);
  process.exit(1);
});

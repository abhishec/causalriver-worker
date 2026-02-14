/**
 * Slack Jarvis — Ingest & Train Pipeline
 *
 * Takes the generated 50K-message PayFlow dataset, transforms it
 * through the full Brain pipeline, and evaluates the results against
 * the embedded causal ground truth.
 *
 * Pipeline:
 *   Load dataset → Convert to signals → Store → Causal Discovery →
 *   Anomaly Detection → Evaluation Report
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm exec tsx scripts/slack-jarvis/ingest-and-train.ts
 *
 *   # Offline mode (no Supabase — runs analysis only):
 *   pnpm exec tsx scripts/slack-jarvis/ingest-and-train.ts --offline
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Import only from memory-stack (avoids pnpm symlink resolution issues) ──
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import { runCausalDiscovery, summarizeDiscovery } from '../../packages/memory-stack/src/causality/causal-discovery-runner';
import { detectAnomalies } from '../../packages/memory-stack/src/learning/anomaly-detector';

// ── Load .env ──
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* no .env file */ }
}
loadEnv();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_JARVIS_ORG_ID = '22222222-2222-4000-a000-222222222222';
const OFFLINE = process.argv.includes('--offline');

// ============================================================================
// INLINE TYPES (avoid importing from slack-connector)
// ============================================================================

interface RawMessage {
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  channel: string;
  type: string;
}

interface RawChannel {
  id: string;
  name: string;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      SLACK JARVIS — Ingest & Train Pipeline              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // ── Step 1: Load dataset ──
  console.log('  [1/6] Loading dataset...');
  const datasetPath = resolve(import.meta.dirname || __dirname, 'dataset.json');
  let raw: string;
  try {
    raw = readFileSync(datasetPath, 'utf-8');
  } catch {
    console.error('  ❌ dataset.json not found. Run generate-dataset.ts first.');
    process.exit(1);
  }

  const parsed = JSON.parse(raw);
  const messages: RawMessage[] = parsed.workspace.messages;
  const channels: RawChannel[] = parsed.workspace.channels;

  console.log(`    Messages: ${messages.length.toLocaleString()}`);
  console.log(`    Channels: ${channels.length}`);

  // ── Step 2: Convert messages to ConnectorSignals ──
  console.log('\n  [2/6] Converting messages to ConnectorSignals...');

  const channelMap = new Map<string, string>();
  for (const ch of channels) {
    channelMap.set(ch.id, ch.name);
  }

  // Create per-message signals (source_domain = channel name for causal discovery)
  const signals: ConnectorSignal[] = [];
  for (const msg of messages) {
    if (msg.thread_ts) continue; // Skip thread replies — only parent messages
    const chName = channelMap.get(msg.channel) ?? msg.channel;
    signals.push({
      organization_id: SLACK_JARVIS_ORG_ID,
      source_domain: chName,
      signal_type: 'message_volume',
      signal_value: 1,
      signal_timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      entity_type: 'slack_channel',
      entity_id: msg.channel,
      metadata: {
        user: msg.user,
        has_thread: !!msg.reply_count,
        text_preview: msg.text.slice(0, 100),
      },
    });
  }

  // Also create reaction signals
  for (const msg of messages) {
    if (!msg.reactions) continue;
    const chName = channelMap.get(msg.channel) ?? msg.channel;
    const totalReactions = msg.reactions.reduce((s, r) => s + r.count, 0);
    signals.push({
      organization_id: SLACK_JARVIS_ORG_ID,
      source_domain: chName,
      signal_type: 'reaction_count',
      signal_value: totalReactions,
      signal_timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      entity_type: 'slack_channel',
      entity_id: msg.channel,
    });
  }

  console.log(`    Total signals: ${signals.length.toLocaleString()}`);
  console.log(`    Parent messages: ${signals.filter((s) => s.signal_type === 'message_volume').length.toLocaleString()}`);
  console.log(`    Reaction signals: ${signals.filter((s) => s.signal_type === 'reaction_count').length.toLocaleString()}`);

  // ── Step 3: Persist to Supabase ──
  if (!OFFLINE) {
    console.log('\n  [3/6] Persisting signals to Supabase...');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('  ❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
      console.error('     Use --offline to skip persistence and run analysis only.');
      process.exit(1);
    }

    const supabase = createClient(url, key);
    const BATCH_SIZE = 500;
    let stored = 0;
    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      const batch = signals.slice(i, i + BATCH_SIZE);
      await storeConnectorSignals(supabase, batch, undefined, SLACK_JARVIS_ORG_ID);
      stored += batch.length;
      if (stored % 5000 === 0 || stored === signals.length) {
        console.log(`    Stored ${stored.toLocaleString()} / ${signals.length.toLocaleString()}`);
      }
    }
    console.log(`    ✅ All signals persisted to cross_domain_signals`);
  } else {
    console.log('\n  [3/6] OFFLINE mode — skipping Supabase persistence');
  }

  // ── Step 4: Run Causal Discovery ──
  console.log('\n  [4/6] Running Causal Discovery (Granger + Three Paradigm)...');

  const causalInput = signals
    .filter((s) => s.signal_type === 'message_volume')
    .map((s) => ({
      source_domain: s.source_domain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      signal_timestamp: s.signal_timestamp ?? new Date().toISOString(),
    }));

  console.log(`    Causal input signals: ${causalInput.length.toLocaleString()}`);

  const discoveryResult = runCausalDiscovery(
    causalInput,
    SLACK_JARVIS_ORG_ID,
    {
      granger: { maxLag: 7, alpha: 0.05 },
      minObservations: 14,
      alpha: 0.05,
      method: 'three_paradigm',
    }
  );

  console.log(`    Domains analyzed: ${discoveryResult.domains_analyzed.length}`);
  console.log(`    Pairs tested: ${discoveryResult.pairs_tested}`);
  console.log(`    Significant edges: ${discoveryResult.significant_count}`);

  if (discoveryResult.warnings.length > 0) {
    console.log(`    Warnings: ${discoveryResult.warnings.length}`);
    for (const w of discoveryResult.warnings.slice(0, 5)) {
      console.log(`      ⚠️  ${w}`);
    }
  }

  // ── Step 5: Anomaly Detection ──
  console.log('\n  [5/6] Running Anomaly Detection...');

  const dailyVolumes = new Map<string, Map<string, number>>();
  for (const msg of messages) {
    if (msg.thread_ts) continue;
    const chName = channelMap.get(msg.channel) ?? msg.channel;
    const day = new Date(parseFloat(msg.ts) * 1000).toISOString().slice(0, 10);
    if (!dailyVolumes.has(chName)) dailyVolumes.set(chName, new Map());
    const chMap = dailyVolumes.get(chName)!;
    chMap.set(day, (chMap.get(day) ?? 0) + 1);
  }

  const anomalyObservations: Array<{
    entityId: string;
    entityType: string;
    metricName: string;
    value: number;
  }> = [];

  for (const [channel, dayMap] of dailyVolumes) {
    for (const [, count] of dayMap) {
      anomalyObservations.push({
        entityId: channel,
        entityType: 'channel',
        metricName: 'daily_message_volume',
        value: count,
      });
    }
  }

  const anomalies = detectAnomalies(anomalyObservations, { method: 'auto' });
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of anomalies) {
    bySeverity[a.severity as keyof typeof bySeverity]++;
  }

  console.log(`    Observations: ${anomalyObservations.length}`);
  console.log(`    Anomalies detected: ${anomalies.length}`);
  console.log(`    Critical: ${bySeverity.critical}  High: ${bySeverity.high}  Medium: ${bySeverity.medium}  Low: ${bySeverity.low}`);

  // ── Step 6: Full CTO Report ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              CTO EVALUATION REPORT                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\n  ═══ CAUSAL DISCOVERY ═══');
  console.log(`  Domains: ${discoveryResult.domains_analyzed.join(', ')}`);
  console.log(`  Pairs tested: ${discoveryResult.pairs_tested}`);
  console.log(`  Significant edges: ${discoveryResult.significant_count}`);

  // Ground truth patterns to look for
  const expectedPatterns = [
    { source: 'deployments', target: 'incidents' },
    { source: 'incidents', target: 'customer-support' },
    { source: 'releases', target: 'customer-support' },
    { source: 'compliance-pci', target: 'engineering' },
  ];

  if (discoveryResult.discovered_relationships.length > 0) {
    console.log('\n  Discovered Edges (sorted by effect size):');
    const sorted = [...discoveryResult.discovered_relationships]
      .sort((a, b) => b.effect_size - a.effect_size);

    let foundCount = 0;
    for (const rel of sorted) {
      const isExpected = expectedPatterns.some(
        (p) =>
          rel.source_domain.includes(p.source) && rel.target_domain.includes(p.target)
      );
      if (isExpected) foundCount++;
      const tag = isExpected ? '✅ EXPECTED' : '⚠️  NOVEL';
      console.log(
        `    ${rel.source_domain.padEnd(22)} → ${rel.target_domain.padEnd(22)} ` +
          `p=${rel.granger_p_value.toFixed(4)}  effect=${rel.effect_size.toFixed(3)}  ` +
          `lag=${rel.optimal_lag_days}d  ${tag}`
      );
    }

    console.log(`\n  Ground Truth Recall: ${foundCount}/${expectedPatterns.length} expected patterns found`);
    console.log(`  Precision: ${foundCount}/${sorted.length} discovered edges match expected`);
  } else {
    console.log('\n  ⚠️  No significant causal edges discovered.');
    console.log('     The channel-level message volumes may not produce strong enough');
    console.log('     temporal correlations for Granger at α=0.05 with Three Paradigm voting.');
    console.log('     This is informative — it tells us the minimum signal strength needed.');
  }

  console.log('\n  ═══ ANOMALY DETECTION ═══');
  console.log(`  Total anomalies: ${anomalies.length}`);
  console.log(`  Critical: ${bySeverity.critical}  High: ${bySeverity.high}  Medium: ${bySeverity.medium}  Low: ${bySeverity.low}`);

  if (anomalies.length > 0) {
    console.log('\n  Top 10 anomalies:');
    const topAnomalies = [...anomalies]
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
      .slice(0, 10);
    for (const a of topAnomalies) {
      console.log(
        `    #${a.entityId.padEnd(22)} z=${a.zScore.toFixed(2).padStart(6)}  ` +
          `observed=${a.observedValue.toFixed(0).padStart(4)}  expected=${a.expectedValue.toFixed(0).padStart(4)}  ` +
          `severity=${a.severity}`
      );
    }

    // Check if incident days have anomalies
    const incidentChannels = anomalies.filter((a) => a.entityId === 'incidents');
    const supportChannels = anomalies.filter((a) => a.entityId === 'customer-support');
    console.log(`\n  Incident channel anomalies: ${incidentChannels.length}`);
    console.log(`  Support channel anomalies: ${supportChannels.length}`);
  }

  console.log('\n  ═══ PIPELINE SUMMARY ═══');
  console.log(`  Messages processed:   ${messages.length.toLocaleString()}`);
  console.log(`  Signals generated:    ${signals.length.toLocaleString()}`);
  console.log(`  Causal edges found:   ${discoveryResult.significant_count}`);
  console.log(`  Anomalies detected:   ${anomalies.length}`);
  console.log(`  Total time:           ${elapsed}s`);
  console.log(`  Mode:                 ${OFFLINE ? 'OFFLINE (no DB)' : 'LIVE (signals persisted)'}`);
  console.log(`  Org ID:               ${SLACK_JARVIS_ORG_ID}`);

  console.log('\n  ═══ BRAIN NATURAL LANGUAGE SUMMARY ═══');
  console.log(summarizeDiscovery(discoveryResult));

  console.log('\n  ✅ Pipeline complete.\n');
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});

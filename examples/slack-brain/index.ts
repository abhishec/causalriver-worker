/**
 * Slack Brain Example — Full Brain-Native Integration
 *
 * Demonstrates the complete end-to-end flow of connecting an org's Slack
 * to NexusBrain:
 *
 *   1. Create Slack connector with org-scoped config
 *   2. Register with SyncManager for automatic full/incremental sync
 *   3. Run initial fullSync to backfill historical data
 *   4. Check sync status
 *   5. Run standalone analytics (Granger causality, anomaly detection)
 *   6. Query the Brain via NexusOrchestrator
 *
 * Data Flow:
 *   Slack API → SlackClient → fetchWorkspaceData → signal-bridge
 *   → storeConnectorSignals → cross_domain_signals table
 *   → signalsToTimeSeries → causal discovery → Brain pipeline
 *
 * Usage:
 *   SLACK_BOT_TOKEN=xoxb-... \
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx index.ts
 *
 * Required Slack Bot Token scopes:
 *   - channels:history, channels:read
 *   - groups:history, groups:read (private channels)
 *   - users:read, reactions:read
 *   - chat:write (for push capabilities)
 */

import { createClient } from '@supabase/supabase-js';
import { createNexusSlackConnector } from '@nexus-ai/slack-connector';
import { createSyncManager } from '@nexus-ai/memory-stack';

// ── Environment Validation ──

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SLACK_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables:');
  if (!SLACK_BOT_TOKEN) console.error('  - SLACK_BOT_TOKEN');
  if (!SUPABASE_URL) console.error('  - SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nUsage:');
  console.error(
    '  SLACK_BOT_TOKEN=xoxb-... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx index.ts'
  );
  process.exit(1);
}

// Replace with your org's UUID from the organizations table
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || '00000000-0000-4000-a000-000000000002';

async function main() {
  console.log('=== NexusBrain — Slack Brain Integration ===\n');

  // ── 1. Create Supabase client ──
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
  console.log('Supabase client created');

  // ── 2. Create Slack connector (Brain-native) ──
  const slack = createNexusSlackConnector({
    token: SLACK_BOT_TOKEN!,
    organizationId: ORGANIZATION_ID,
    domain: 'communication',
    lookbackDays: 90,
    includeThreads: true,
  });

  console.log(`Slack connector created: id=${slack.id}, name=${slack.name}, domain=${slack.domain}`);

  // ── 3. Register with SyncManager ──
  const syncManager = createSyncManager({ connectors: [slack] });
  console.log('Slack registered with SyncManager\n');

  // ── 4. Run sync (auto-detects full vs incremental) ──
  console.log('--- Syncing Slack to Brain ---');
  console.log('This will:');
  console.log('  a) Fetch workspace data from Slack API');
  console.log('  b) Convert messages + analytics to ConnectorSignal[]');
  console.log('  c) Persist to cross_domain_signals table (org-scoped)');
  console.log('  d) Record sync result in connector_sync_log');
  console.log('  e) Update sync cursor for future incremental syncs\n');

  const syncResults = await syncManager.syncAll(supabase, ORGANIZATION_ID);

  for (const result of syncResults) {
    if (result.success) {
      console.log(`Sync SUCCESS:`);
      console.log(`  Signals generated: ${result.signalsGenerated}`);
      console.log(`  Records processed: ${result.recordsProcessed}`);
      console.log(`  Duration: ${result.duration_ms}ms`);
    } else {
      console.log(`Sync FAILED:`);
      console.log(`  Errors: ${result.errors.join(', ')}`);
    }
  }

  // ── 5. Check sync status ──
  console.log('\n--- Sync Status ---');
  const status = await syncManager.getStatus(supabase, ORGANIZATION_ID);
  for (const s of status) {
    console.log(`  ${s.connectorName} (${s.connectorId}):`);
    console.log(`    Domain: ${s.domain}`);
    console.log(`    Status: ${s.status}`);
    if (s.lastSynced) {
      console.log(`    Last synced: ${s.lastSynced.toISOString()}`);
    }
    if (s.lastError) {
      console.log(`    Last error: ${s.lastError}`);
    }
  }

  // ── 6. Run standalone analytics (optional — works without Supabase) ──
  console.log('\n--- Standalone Analytics ---');
  console.log('Running workspace analysis...');
  const insights = await slack.run();

  console.log(`Total channels: ${insights.summary.totalChannels}`);
  console.log(`Total messages: ${insights.summary.totalMessages}`);
  console.log(`Total users: ${insights.summary.totalUsers}`);
  console.log(`Most active channels: ${insights.summary.mostActiveChannels.slice(0, 3).join(', ')}`);

  if (insights.anomalies.length > 0) {
    console.log(`\nAnomalies detected: ${insights.anomalies.length}`);
    for (const a of insights.anomalies.slice(0, 3)) {
      console.log(`  [${a.severity}] #${a.channelName}: ${a.explanation}`);
    }
  }

  if (insights.causalRelationships.length > 0) {
    console.log(`\nCausal relationships: ${insights.causalRelationships.length}`);
    for (const r of insights.causalRelationships.slice(0, 3)) {
      console.log(`  ${r.source} -> ${r.target} (lag: ${r.lagDays}d, p=${r.pValue.toFixed(4)})`);
    }
  }

  // ── 7. Demonstrate push capabilities ──
  console.log('\n--- Push Capabilities (available but not executing) ---');
  console.log('  slack.sendMessage("#general", "Hello from NexusBrain!")');
  console.log('  slack.replyToThread("#eng", "1234567890.123456", "Analysis complete")');
  console.log('  slack.addReaction("#alerts", "1234567890.123456", "white_check_mark")');
  console.log('  slack.uploadSnippet("#data", "{ json: data }", "analysis.json")');

  // ── 8. What happens next (in production) ──
  console.log('\n--- What Happens Next (in production) ---');
  console.log('The signals stored in cross_domain_signals now flow through:');
  console.log('  1. signalsToTimeSeries() — converts to time series');
  console.log('  2. runCausalDiscovery() — finds Granger-causal relationships');
  console.log('  3. Event Bus — 5 bridges process signals in real-time');
  console.log('  4. BrainPipeline — consolidation, DMN scan, impact scoring');
  console.log('  5. Federation — anonymized patterns promoted to Core Brain');
  console.log('\nSet up nexus-webhook for real-time Slack events:');
  console.log(`  URL: <SUPABASE_URL>/functions/v1/nexus-webhook?source=slack&org=${ORGANIZATION_ID}`);
  console.log('  Events: message, reaction_added, app_mention');

  console.log('\n=== Done ===');
}

main().catch(console.error);

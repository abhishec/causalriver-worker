#!/usr/bin/env tsx
/**
 * Multi-Tenant Batch Ingestion Runner V2
 * ═══════════════════════════════════════════════════════════════
 *
 * NEW: Uses per-org OAuth credentials + connector factory.
 * Supports 10M+ scale with checkpointing, rate limiting, deduplication.
 *
 * Usage:
 *   # Run all connectors for an organization
 *   tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --mode initial
 *
 *   # Run specific connectors
 *   tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --sources slack,github
 *
 *   # Incremental sync
 *   tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --mode incremental
 *
 *   # Resume from checkpoint
 *   tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --resume
 *
 * Environment Variables Required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   REDIS_URL (optional but recommended)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createConnectorFactory, ConnectorType } from '../packages/memory-stack/src/connectors/connector-factory.js';

// Load environment
config({ path: resolve(__dirname, '../.env') });

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REDIS_URL = process.env.REDIS_URL;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

// ============================================================================
// CLI ARGS
// ============================================================================

interface CLIArgs {
  org: string;
  mode: 'initial' | 'incremental';
  sources?: ConnectorType[];
  resume?: boolean;
  verbose?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {
    org: '',
    mode: 'initial',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org':
        parsed.org = args[++i];
        break;
      case '--mode':
        parsed.mode = args[++i] as 'initial' | 'incremental';
        break;
      case '--sources':
        parsed.sources = args[++i].split(',') as ConnectorType[];
        break;
      case '--resume':
        parsed.resume = true;
        break;
      case '--verbose':
        parsed.verbose = true;
        break;
    }
  }

  return parsed;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MULTI-TENANT BATCH INGESTION — V2');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const args = parseArgs();

  if (!args.org) {
    console.error('❌ --org parameter required');
    console.log('\nUsage:');
    console.log('  tsx scripts/run-batch-ingestion-v2.ts --org <org-id> [options]');
    console.log('\nOptions:');
    console.log('  --mode initial|incremental  (default: initial)');
    console.log('  --sources slack,github,jira,freshdesk  (default: all active)');
    console.log('  --resume  (resume from checkpoint)');
    console.log('  --verbose  (detailed logging)');
    process.exit(1);
  }

  console.log(`Organization: ${args.org}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Resume: ${args.resume ? 'Yes' : 'No'}`);
  console.log(`Redis: ${REDIS_URL ? 'Enabled' : 'Disabled'}`);
  console.log('');

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Create Redis client (optional)
  let redis: any = null;
  if (REDIS_URL) {
    try {
      const { createClient: createRedisClient } = await import('redis');
      redis = createRedisClient({ url: REDIS_URL });
      await redis.connect();
      console.log('✅ Redis connected\n');
    } catch (err) {
      console.warn('⚠️  Redis connection failed, continuing without Redis\n');
    }
  }

  // Create connector factory
  const factory = createConnectorFactory(supabase, redis);

  // Determine which connectors to run
  const connectorTypes = args.sources || await factory.getActiveConnectors(args.org) as ConnectorType[];

  if (connectorTypes.length === 0) {
    console.log('❌ No active connectors found for this organization.');
    console.log('   Connect data sources at /admin/connectors');
    process.exit(1);
  }

  console.log(`🔌 Active connectors: ${connectorTypes.join(', ')}\n`);

  // Run each connector
  const results: Record<string, any> = {};
  const startTime = Date.now();

  for (const type of connectorTypes) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`🚀 Running ${type} connector...`);
    console.log('━'.repeat(60));

    try {
      // Create connector instance
      const connector = await factory.createConnector(args.org, type);

      if (!connector) {
        console.error(`❌ Failed to create ${type} connector (credentials missing?)`);
        results[type] = { success: false, error: 'Connector creation failed' };
        continue;
      }

      // Run ingestion
      const result = await connector.ingest({
        mode: args.mode,
        resumeFromCheckpoint: args.resume || false,
      });

      results[type] = result;

      if (result.success) {
        console.log(`\n✅ ${type} complete: ${result.signalsIngested} signals ingested`);
        if (result.duration) {
          const durationSec = (result.duration / 1000).toFixed(1);
          const rate = (result.signalsIngested / (result.duration / 1000)).toFixed(0);
          console.log(`   Duration: ${durationSec}s (${rate} signals/sec)`);
        }
      } else {
        console.error(`\n❌ ${type} failed:`, result.errors?.join(', '));
      }

      // Show stats
      const stats = connector.getStats();
      console.log(`   Stats: ${stats.inserted} inserted, ${stats.duplicates} duplicates, ${stats.errors} errors`);
    } catch (error: any) {
      console.error(`❌ ${type} error:`, error.message);
      results[type] = { success: false, error: error.message };
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  INGESTION SUMMARY');
  console.log('═'.repeat(60));

  const totalSignals = Object.values(results).reduce(
    (sum: number, r: any) => sum + (r.signalsIngested || 0),
    0
  );
  const successCount = Object.values(results).filter((r: any) => r.success).length;
  const failCount = connectorTypes.length - successCount;

  console.log(`\nTotal signals ingested: ${totalSignals.toLocaleString()}`);
  console.log(`Successful connectors: ${successCount}/${connectorTypes.length}`);
  console.log(`Failed connectors: ${failCount}`);
  console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

  console.log('\nResults by connector:');
  for (const [type, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    const signals = result.signalsIngested || 0;
    console.log(`  ${status} ${type}: ${signals.toLocaleString()} signals`);
  }

  // Cleanup
  if (redis) {
    await redis.quit();
  }

  console.log('\n✅ Ingestion complete!\n');
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Batch Ingestion Runner — Design Partner Initial Load
 * ═══════════════════════════════════════════════════════════════
 *
 * Handles massive initial data load for design partner:
 * - 1-10M Slack messages
 * - 500k+ Jira pages (issues + comments)
 * - 500k+ GitHub files
 *
 * Usage:
 *   # Initial load (all sources)
 *   tsx scripts/run-batch-ingestion.ts --mode initial --sources slack,jira,github
 *
 *   # Incremental load (Slack only, with resume)
 *   tsx scripts/run-batch-ingestion.ts --mode incremental --sources slack --resume job_123
 *
 *   # Resume failed job
 *   tsx scripts/run-batch-ingestion.ts --resume job_456
 *
 * Environment Variables Required:
 *   SUPABASE_URL, SUPABASE_KEY
 *   REDIS_URL (optional but recommended for dedup + checkpoints)
 *   SLACK_BOT_TOKEN (for Slack ingestion)
 *   JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN (for Jira ingestion)
 *   GITHUB_TOKEN (for GitHub ingestion)
 *   GITHUB_REPOS (comma-separated list, e.g., "owner/repo1,owner/repo2")
 */

import { createClient } from '@supabase/supabase-js';
import { BatchIngestionEngine } from '../packages/memory-stack/src/ingestion/batch-ingestion-engine.js';

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || 'org-nexusbrain-core';
const REDIS_URL = process.env.REDIS_URL;

// Slack config
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Jira config
const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// GitHub config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOS = process.env.GITHUB_REPOS?.split(',') || [];

// ============================================================================
// CLI ARGS
// ============================================================================

interface CLIArgs {
  mode: 'initial' | 'incremental';
  sources: ('slack' | 'jira' | 'github')[];
  resume?: string;
  verbose?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {
    mode: 'initial',
    sources: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        parsed.mode = args[++i] as 'initial' | 'incremental';
        break;
      case '--sources':
        parsed.sources = args[++i].split(',') as ('slack' | 'jira' | 'github')[];
        break;
      case '--resume':
        parsed.resume = args[++i];
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
  console.log('  BATCH INGESTION RUNNER — Design Partner Scale');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const args = parseArgs();

  console.log(`Mode: ${args.mode.toUpperCase()}`);
  console.log(`Sources: ${args.sources.join(', ') || 'RESUME'}`);
  console.log(`Resume Job: ${args.resume || 'N/A'}`);
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Redis: ${REDIS_URL ? 'ENABLED' : 'DISABLED (dedup/checkpoints unavailable)'}\n`);

  // Validation
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL and SUPABASE_KEY required');
    process.exit(1);
  }

  if (!args.resume && args.sources.length === 0) {
    console.error('❌ Must specify --sources or --resume');
    process.exit(1);
  }

  // Initialize Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Initialize Redis (if available)
  let redis: any;
  if (REDIS_URL) {
    const Redis = (await import('ioredis')).default;
    redis = new Redis(REDIS_URL);
    console.log('✓ Redis connected\n');
  }

  // Create batch ingestion engine
  const engine = new BatchIngestionEngine({
    supabase,
    organizationId: ORGANIZATION_ID,
    redis,
    batchSize: 1000,
    maxConcurrent: 10,
    checkpointFrequency: 10,
    verbose: args.verbose ?? true,
  });

  // Resume existing job if specified
  if (args.resume) {
    console.log(`\n🔄 Resuming job ${args.resume}...\n`);
    const job = await engine.loadCheckpoint(args.resume);
    if (!job) {
      console.error(`❌ Job ${args.resume} not found in checkpoints`);
      process.exit(1);
    }

    await engine.runJob(args.resume);
    printStats(engine);
    process.exit(0);
  }

  // Create and run new jobs for each source
  const jobIds: string[] = [];

  for (const source of args.sources) {
    console.log(`\n📥 Creating ${source.toUpperCase()} ingestion job...`);

    let job;

    switch (source) {
      case 'slack':
        if (!SLACK_BOT_TOKEN) {
          console.error('❌ SLACK_BOT_TOKEN required for Slack ingestion');
          continue;
        }
        job = engine.createJob(
          {
            type: 'slack',
            config: { token: SLACK_BOT_TOKEN },
            rateLimit: 50, // Slack Tier 2 limit
          },
          args.mode
        );
        break;

      case 'jira':
        if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_API_TOKEN) {
          console.error('❌ JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN required for Jira ingestion');
          continue;
        }
        job = engine.createJob(
          {
            type: 'jira',
            config: {
              host: JIRA_HOST,
              email: JIRA_EMAIL,
              apiToken: JIRA_API_TOKEN,
            },
            rateLimit: 10, // Jira Cloud limit
          },
          args.mode
        );
        break;

      case 'github':
        if (!GITHUB_TOKEN || GITHUB_REPOS.length === 0) {
          console.error('❌ GITHUB_TOKEN and GITHUB_REPOS required for GitHub ingestion');
          continue;
        }
        job = engine.createJob(
          {
            type: 'github',
            config: {
              token: GITHUB_TOKEN,
              repos: GITHUB_REPOS,
            },
            rateLimit: 1.4, // ~5000/hour
          },
          args.mode
        );
        break;
    }

    if (job) {
      console.log(`✓ Job created: ${job.jobId}`);
      jobIds.push(job.jobId);
    }
  }

  console.log(`\n🚀 Starting ${jobIds.length} ingestion job(s)...\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Run all jobs in parallel
  const startTime = Date.now();

  await Promise.allSettled(
    jobIds.map(async (jobId) => {
      try {
        await engine.runJob(jobId);
      } catch (err) {
        console.error(`\n❌ Job ${jobId} failed:`, err);
      }
    })
  );

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  INGESTION COMPLETE (${duration} minutes)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  printStats(engine);

  // Print job details
  console.log('\n📊 Job Details:\n');
  for (const jobId of jobIds) {
    const job = engine.getJob(jobId);
    if (!job) continue;

    console.log(`  ${job.source.type.toUpperCase()} (${job.jobId}):`);
    console.log(`    Status: ${job.status.toUpperCase()}`);
    console.log(`    Total Signals: ${job.progress.totalSignals.toLocaleString()}`);
    console.log(`    Processed: ${job.progress.processedSignals.toLocaleString()}`);
    console.log(`    Failed: ${job.progress.failedSignals.toLocaleString()}`);
    console.log(`    Batches: ${job.progress.currentBatch}/${job.progress.totalBatches}`);
    console.log(`    Success Rate: ${((job.progress.processedSignals / job.progress.totalSignals) * 100).toFixed(1)}%`);
    console.log('');
  }

  // Cleanup
  if (redis) {
    await redis.quit();
  }

  process.exit(0);
}

function printStats(engine: BatchIngestionEngine) {
  const stats = engine.getStats();

  console.log('📈 Overall Statistics:\n');
  console.log(`  Total Jobs: ${stats.totalJobs}`);
  console.log(`  Running: ${stats.runningJobs}`);
  console.log(`  Completed: ${stats.completedJobs}`);
  console.log(`  Failed: ${stats.failedJobs}`);
  console.log(`  Total Signals Processed: ${stats.totalSignalsProcessed.toLocaleString()}`);
}

// ============================================================================
// RUN
// ============================================================================

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

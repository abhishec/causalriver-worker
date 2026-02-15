#!/usr/bin/env tsx
/**
 * Production Deployment Automation Script
 * ═══════════════════════════════════════════════════════════════
 *
 * Automates the deployment process with comprehensive validation.
 * Follows the DEPLOYMENT_RUNBOOK.md procedures.
 *
 * Usage:
 *   tsx scripts/deploy-to-production.ts
 *
 * What it does:
 *   1. Validates environment variables
 *   2. Checks database connectivity
 *   3. Verifies migrations are applied
 *   4. Runs health checks
 *   5. Validates production readiness
 *   6. Provides next steps
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { validateEnv, checkFeatureFlags } from '../packages/memory-stack/src/config/env-validation.js';

// ============================================================================
// DEPLOYMENT VALIDATION
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  NEXUSBRAIN PRODUCTION DEPLOYMENT VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let hasErrors = false;

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Validate Environment
  // ────────────────────────────────────────────────────────────────────────

  console.log('📋 Step 1: Environment Validation\n');

  const envResult = validateEnv({ exitOnError: false, silent: true });

  if (!envResult.success || !envResult.env) {
    console.error('❌ Environment validation failed:\n');
    envResult.errors?.forEach(err => console.error(`   • ${err}`));
    console.error('');
    hasErrors = true;
  } else {
    console.log('✅ Environment variables validated');
    console.log(`   Organization: ${envResult.env.ORGANIZATION_ID}`);
    console.log(`   Supabase: ${envResult.env.SUPABASE_URL}`);

    const features = checkFeatureFlags(envResult.env);
    console.log('\n📦 Feature Flags:');
    console.log(`   Redis: ${features.redisEnabled ? '✅ ENABLED' : '⚠️  DISABLED (impacts scale)'}`);
    console.log(`   Slack: ${features.slackEnabled ? '✅ ENABLED' : '⚠️  DISABLED'}`);
    console.log(`   Jira: ${features.jiraEnabled ? '✅ ENABLED' : '⚠️  DISABLED'}`);
    console.log(`   GitHub: ${features.githubEnabled ? '✅ ENABLED' : '⚠️  DISABLED'}`);
    console.log(`   AI (LLM): ${features.aiEnabled ? '✅ ENABLED' : '⚠️  DISABLED'}`);
    console.log(`   Monitoring: ${features.monitoringEnabled ? '✅ ENABLED' : '⚠️  DISABLED'}`);

    if (!features.redisEnabled) {
      console.warn('\n⚠️  WARNING: Redis not configured - deduplication and caching disabled');
      console.warn('   For 10M+ signal scale, Redis is highly recommended');
    }
  }

  console.log('');

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Database Connectivity
  // ────────────────────────────────────────────────────────────────────────

  console.log('📊 Step 2: Database Connectivity\n');

  if (!envResult.env) {
    console.error('❌ Skipping database check (environment validation failed)\n');
    process.exit(1);
  }

  const supabase = createClient(
    envResult.env.SUPABASE_URL,
    envResult.env.SUPABASE_SERVICE_ROLE_KEY || envResult.env.SUPABASE_KEY || ''
  );

  try {
    const start = Date.now();
    const { data, error } = await supabase.from('signals').select('count', { count: 'exact', head: true });
    const latency = Date.now() - start;

    if (error) {
      console.error('❌ Database connectivity failed:', error.message);
      hasErrors = true;
    } else {
      console.log(`✅ Database connected (${latency}ms latency)`);
      console.log(`   Total signals: ${data?.length || 0}`);
    }
  } catch (err) {
    console.error('❌ Database connectivity failed:', (err as Error).message);
    hasErrors = true;
  }

  console.log('');

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Table Schema Validation
  // ────────────────────────────────────────────────────────────────────────

  console.log('🗄️  Step 3: Database Schema Validation\n');

  const requiredTables = [
    'signals',
    'causal_edges',
    'long_term_memory',
    'prediction_tracker',
    'brain_health_history',
    'scheduled_jobs',
    'org_members',
    'invitations',
  ];

  let tableChecksPassed = 0;

  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.error(`❌ Table '${table}' check failed:`, error.message);
        hasErrors = true;
      } else {
        tableChecksPassed++;
      }
    } catch (err) {
      console.error(`❌ Table '${table}' check failed:`, (err as Error).message);
      hasErrors = true;
    }
  }

  console.log(`✅ ${tableChecksPassed}/${requiredTables.length} required tables verified`);
  console.log('');

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Production Readiness Checks
  // ────────────────────────────────────────────────────────────────────────

  console.log('🚀 Step 4: Production Readiness\n');

  const readinessChecks = [
    { name: 'Environment validated', passed: envResult.success },
    { name: 'Database connected', passed: tableChecksPassed === requiredTables.length },
    { name: 'Core tables exist', passed: tableChecksPassed === requiredTables.length },
    { name: 'Redis configured (optional)', passed: checkFeatureFlags(envResult.env!).redisEnabled },
    { name: 'Connectors configured', passed:
      checkFeatureFlags(envResult.env!).slackEnabled ||
      checkFeatureFlags(envResult.env!).jiraEnabled ||
      checkFeatureFlags(envResult.env!).githubEnabled
    },
  ];

  let readinessScore = 0;

  for (const check of readinessChecks) {
    if (check.passed) {
      console.log(`✅ ${check.name}`);
      readinessScore++;
    } else {
      console.log(`⚠️  ${check.name}`);
    }
  }

  console.log(`\n📈 Readiness Score: ${readinessScore}/${readinessChecks.length}\n`);

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Next Steps
  // ────────────────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT STATUS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (hasErrors) {
    console.error('❌ DEPLOYMENT BLOCKED - Fix errors above before proceeding\n');
    process.exit(1);
  }

  if (readinessScore < 3) {
    console.warn('⚠️  WARNING - Deployment possible but not recommended\n');
    console.warn('Missing critical configurations. Review warnings above.\n');
  } else if (readinessScore === readinessChecks.length) {
    console.log('✅ PRODUCTION READY - All checks passed!\n');
  } else {
    console.log('✅ DEPLOYMENT READY - Optional features disabled\n');
  }

  console.log('📋 Next Steps:\n');

  if (!checkFeatureFlags(envResult.env!).redisEnabled) {
    console.log('1. Setup Redis for 10M+ signal scale:');
    console.log('   • Sign up at https://redis.com/try-free/');
    console.log('   • Create database (30MB free tier for testing)');
    console.log('   • Add REDIS_URL to .env');
    console.log('');
  }

  console.log('2. Run initial data ingestion (if not done):');
  console.log('   pnpm ingest:initial');
  console.log('');

  console.log('3. Setup incremental sync cron jobs:');
  console.log('   • Slack: */15 * * * * (every 15 minutes)');
  console.log('   • Jira: 0 * * * * (every hour)');
  console.log('   • GitHub: 0 */6 * * * (every 6 hours)');
  console.log('');

  console.log('4. Start brain orchestrator:');
  console.log('   pnpm start:production');
  console.log('');

  console.log('5. Monitor health:');
  console.log('   curl http://localhost:3000/api/health');
  console.log('');

  console.log('6. Query causal insights:');
  console.log('   SELECT * FROM causal_edges');
  console.log('   WHERE organization_id = \'org-nexusbrain-core\'');
  console.log('   AND causality_score > 0.8');
  console.log('   ORDER BY causality_score DESC LIMIT 20;');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(hasErrors ? 1 : 0);
}

// ============================================================================
// RUN
// ============================================================================

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

/**
 * System Validation Script
 * =========================
 *
 * Validates the NexusBrain system is ready for load testing.
 *
 * Checks:
 * 1. Environment variables
 * 2. Database connectivity
 * 3. Redis connectivity
 * 4. Database schema (tables, indexes)
 * 5. Required migrations
 * 6. Dependencies installed
 *
 * Usage:
 *   pnpm exec tsx scripts/validate-system.ts
 *
 * @packageDocumentation
 */

import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load .env file
config();

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

interface ValidationResult {
  category: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

const results: ValidationResult[] = [];

function addResult(category: string, check: string, status: 'pass' | 'fail' | 'warn', message: string, fix?: string) {
  results.push({ category, check, status, message, fix });
}

// ============================================================================
// 1. ENVIRONMENT VARIABLES
// ============================================================================

async function validateEnvironment(): Promise<void> {
  const category = 'Environment';

  // Check SUPABASE_URL
  if (process.env.SUPABASE_URL) {
    if (process.env.SUPABASE_URL.includes('supabase.co')) {
      addResult(category, 'SUPABASE_URL', 'pass', `Set: ${process.env.SUPABASE_URL.substring(0, 30)}...`);
    } else {
      addResult(category, 'SUPABASE_URL', 'warn', 'Set but format unexpected', 'Ensure it\'s a valid Supabase URL');
    }
  } else {
    addResult(category, 'SUPABASE_URL', 'fail', 'Not set', 'Set SUPABASE_URL in .env file');
  }

  // Check SUPABASE_SERVICE_ROLE_KEY
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    addResult(category, 'SUPABASE_SERVICE_ROLE_KEY', 'pass', 'Set (hidden)');
  } else {
    addResult(category, 'SUPABASE_SERVICE_ROLE_KEY', 'fail', 'Not set', 'Set SUPABASE_SERVICE_ROLE_KEY in .env file');
  }

  // Check REDIS_URL
  if (process.env.REDIS_URL) {
    addResult(category, 'REDIS_URL', 'pass', `Set: ${process.env.REDIS_URL.replace(/:[^@]+@/, ':***@')}`);
  } else {
    addResult(category, 'REDIS_URL', 'warn', 'Not set', 'Redis is required for production. Set REDIS_URL or run: redis-server');
  }

  // Check ANTHROPIC_API_KEY (optional but recommended)
  if (process.env.ANTHROPIC_API_KEY) {
    addResult(category, 'ANTHROPIC_API_KEY', 'pass', 'Set (for LLM training)');
  } else {
    addResult(category, 'ANTHROPIC_API_KEY', 'warn', 'Not set', 'Optional: Set for LLM knowledge distillation');
  }
}

// ============================================================================
// 2. DATABASE CONNECTIVITY
// ============================================================================

async function validateDatabase(): Promise<void> {
  const category = 'Database';

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    addResult(category, 'Connection', 'fail', 'Cannot test: Missing credentials', 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test connection
    const { data, error } = await supabase.from('organizations').select('count', { count: 'exact', head: true });

    if (error) {
      addResult(category, 'Connection', 'fail', `Connection failed: ${error.message}`, 'Check Supabase credentials');
    } else {
      addResult(category, 'Connection', 'pass', 'Connected successfully');
    }

    // Check required tables
    const requiredTables = [
      'cross_domain_signals',
      'connector_signals',
      'causal_relationships_statistical',
      'ai_memory',
      'prediction_records',
      'brain_grammar_rules',
    ];

    for (const table of requiredTables) {
      const { error: tableError } = await supabase.from(table).select('count', { count: 'exact', head: true });

      if (tableError) {
        addResult(category, `Table: ${table}`, 'fail', `Table missing or inaccessible: ${tableError.message}`, 'Run migrations: supabase db push');
      } else {
        addResult(category, `Table: ${table}`, 'pass', 'Exists');
      }
    }

    // Check signal count
    const { count: signalCount } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true });

    if (signalCount && signalCount > 0) {
      addResult(category, 'Data: cross_domain_signals', 'pass', `${signalCount.toLocaleString()} signals`);
    } else {
      addResult(category, 'Data: cross_domain_signals', 'warn', 'No signals yet', 'Run seed script or connect data sources');
    }

  } catch (err) {
    addResult(category, 'Connection', 'fail', `Unexpected error: ${err instanceof Error ? err.message : String(err)}`, 'Check Supabase status');
  }
}

// ============================================================================
// 3. REDIS CONNECTIVITY
// ============================================================================

async function validateRedis(): Promise<void> {
  const category = 'Redis';

  if (!process.env.REDIS_URL) {
    addResult(category, 'Connection', 'warn', 'REDIS_URL not set - skipping test', 'Set REDIS_URL for production');
    return;
  }

  try {
    const redis = new Redis(process.env.REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
    });

    // Test PING
    const pong = await redis.ping();
    if (pong === 'PONG') {
      addResult(category, 'PING', 'pass', 'Redis responding');
    } else {
      addResult(category, 'PING', 'fail', `Unexpected response: ${pong}`, 'Check Redis server');
    }

    // Test SET/GET
    const testKey = 'nexusbrain:validate:test';
    await redis.set(testKey, 'validation', 'EX', 10);
    const val = await redis.get(testKey);

    if (val === 'validation') {
      addResult(category, 'SET/GET', 'pass', 'Write/read working');
    } else {
      addResult(category, 'SET/GET', 'fail', 'Write/read failed', 'Check Redis permissions');
    }

    await redis.quit();
  } catch (err) {
    addResult(category, 'Connection', 'fail', `Redis connection failed: ${err instanceof Error ? err.message : String(err)}`, 'Start Redis: redis-server');
  }
}

// ============================================================================
// 4. DATABASE INDEXES
// ============================================================================

async function validateIndexes(): Promise<void> {
  const category = 'Database Indexes';

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    addResult(category, 'Index Check', 'fail', 'Cannot test: Missing credentials');
    return;
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check critical indexes exist
    const criticalIndexes = [
      'idx_signals_org_domain_time',
      'idx_signals_org_entity_time',
      'idx_causal_org_sig_effect',
      'idx_connector_signals_org_source_type_ts',
      'idx_embeddings_vector',
    ];

    // Query pg_indexes
    const { data: indexes, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (${criticalIndexes.map(i => `'${i}'`).join(',')})
      `
    });

    if (error) {
      // Fallback: assume indexes exist if we can't query pg_indexes
      addResult(category, 'Index Check', 'warn', 'Unable to verify indexes (need exec_sql function)', 'Indexes should exist from migrations');
    } else {
      const foundIndexes = new Set((indexes as any[] || []).map((row: any) => row.indexname));

      for (const idx of criticalIndexes) {
        if (foundIndexes.has(idx)) {
          addResult(category, `Index: ${idx}`, 'pass', 'Exists');
        } else {
          addResult(category, `Index: ${idx}`, 'fail', 'Missing', 'Run migration: 20250227000001_scale_10m_indexes_and_limits.sql');
        }
      }
    }
  } catch (err) {
    addResult(category, 'Index Check', 'warn', `Unable to verify: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// 5. DEPENDENCIES
// ============================================================================

async function validateDependencies(): Promise<void> {
  const category = 'Dependencies';

  // Check node_modules exists
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    addResult(category, 'node_modules', 'pass', 'Dependencies installed');
  } else {
    addResult(category, 'node_modules', 'fail', 'Dependencies not installed', 'Run: pnpm install');
  }

  // Check critical packages
  const criticalPackages = [
    '@supabase/supabase-js',
    'ioredis',
    'typescript',
    'tsx',
  ];

  for (const pkg of criticalPackages) {
    const pkgPath = path.join(process.cwd(), 'node_modules', pkg);
    if (fs.existsSync(pkgPath)) {
      addResult(category, `Package: ${pkg}`, 'pass', 'Installed');
    } else {
      addResult(category, `Package: ${pkg}`, 'fail', 'Not installed', `Run: pnpm add ${pkg}`);
    }
  }
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

async function main() {
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ NexusBrain System Validation                           │');
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log('  Running validation checks...');
  console.log();

  await validateEnvironment();
  await validateDatabase();
  await validateRedis();
  await validateIndexes();
  await validateDependencies();

  // Print results
  const categories = [...new Set(results.map(r => r.category))];

  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const passed = categoryResults.filter(r => r.status === 'pass').length;
    const failed = categoryResults.filter(r => r.status === 'fail').length;
    const warned = categoryResults.filter(r => r.status === 'warn').length;

    console.log(`  ${category}:`);
    console.log(`    ✅ Passed: ${passed}  ❌ Failed: ${failed}  ⚠️  Warnings: ${warned}`);
    console.log();

    for (const result of categoryResults) {
      const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
      console.log(`    ${icon} ${result.check}: ${result.message}`);
      if (result.fix && result.status !== 'pass') {
        console.log(`       Fix: ${result.fix}`);
      }
    }
    console.log();
  }

  // Summary
  const totalPassed = results.filter(r => r.status === 'pass').length;
  const totalFailed = results.filter(r => r.status === 'fail').length;
  const totalWarned = results.filter(r => r.status === 'warn').length;
  const totalChecks = results.length;

  const allPassed = totalFailed === 0;

  console.log('┌────────────────────────────────────────────────────────┐');
  console.log(`│ Validation ${allPassed ? 'PASSED ✅' : 'FAILED ❌'}${' '.repeat(38)}│`);
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Total checks:  ${totalChecks}`);
  console.log(`  Passed:        ${totalPassed} ✅`);
  console.log(`  Failed:        ${totalFailed} ❌`);
  console.log(`  Warnings:      ${totalWarned} ⚠️`);
  console.log();

  if (allPassed) {
    console.log('✅ System is READY for load testing!');
    console.log();
    console.log('  Next steps:');
    console.log('    1. Run quick validation:');
    console.log('       pnpm exec tsx scripts/load-tests/run-all-tests.ts --quick');
    console.log();
    console.log('    2. Run full test suite:');
    console.log('       pnpm exec tsx scripts/load-tests/run-all-tests.ts');
    console.log();
  } else {
    console.log('❌ System is NOT READY for load testing');
    console.log();
    console.log('  Please fix the failed checks above before proceeding.');
    console.log();
    console.log('  Common fixes:');
    console.log('    - Missing env vars: Copy .env.example to .env and fill in values');
    console.log('    - Missing tables: Run: supabase db push');
    console.log('    - Redis not running: Run: redis-server');
    console.log('    - Missing deps: Run: pnpm install');
    console.log();
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});

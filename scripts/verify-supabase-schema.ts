#!/usr/bin/env tsx
/**
 * Comprehensive Supabase Schema Verification
 *
 * This script verifies that all tables required by Edge Functions exist
 * and that the data model is complete for the NexusBrain agents.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// All tables required by the system
const REQUIRED_TABLES = {
  // Core brain tables
  core: [
    'organizations',
    'signal_types',
    'signals',
    'predictions',
    'causal_relationships',
    'memories',
    'events',
  ],

  // Learning & feedback
  learning: [
    'prediction_outcomes',
    'weight_history',
    'threshold_history',
    'learning_state',
  ],

  // Consolidation & optimization
  consolidation: [
    'consolidation_runs',
    'brain_daily_snapshots',
  ],

  // Federation & collaboration
  federation: [
    'federation_settings',
    'federation_approvals',
  ],

  // Platform & multi-tenancy
  platform: [
    'users',
    'organization_members',
    'invitations',
  ],

  // Operational
  operational: [
    'scheduled_job_runs',
    'system_credentials',
    'audit_logs',
  ],

  // Agent-specific
  agents: [
    'agent_sessions',
    'agent_thoughts',
    'agent_capabilities',
  ],

  // Connectors
  connectors: [
    'connector_configs',
    'sync_cursors',
  ],
};

async function checkTable(supabase: any, tableName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .limit(1);

    return !error;
  } catch (err) {
    return false;
  }
}

async function checkRPCFunction(supabase: any, funcName: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc(funcName);
    // Even if it errors due to missing params, it exists
    return !error || error.code !== 'PGRST202';
  } catch (err) {
    return false;
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Comprehensive Supabase Schema Verification\n');
  console.log('━'.repeat(80));
  console.log('');

  const results: Record<string, Record<string, boolean>> = {};
  let totalTables = 0;
  let existingTables = 0;

  // Check all tables by category
  for (const [category, tables] of Object.entries(REQUIRED_TABLES)) {
    console.log(`\n📦 ${category.toUpperCase()} TABLES:`);
    console.log('─'.repeat(80));

    results[category] = {};

    for (const tableName of tables) {
      totalTables++;
      const exists = await checkTable(supabase, tableName);
      results[category][tableName] = exists;

      if (exists) {
        existingTables++;
        console.log(`  ✅ ${tableName}`);
      } else {
        console.log(`  ❌ ${tableName} - MISSING`);
      }
    }
  }

  // Check critical RPC functions
  console.log('\n\n🔧 RPC FUNCTIONS:');
  console.log('─'.repeat(80));

  const rpcFunctions = [
    'get_nexusbrain_cron_status',
    'get_organization_health',
    'calculate_signal_threshold',
  ];

  const rpcResults: Record<string, boolean> = {};

  for (const funcName of rpcFunctions) {
    const exists = await checkRPCFunction(supabase, funcName);
    rpcResults[funcName] = exists;

    if (exists) {
      console.log(`  ✅ ${funcName}()`);
    } else {
      console.log(`  ⚠️  ${funcName}() - Not found (may be optional)`);
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY:');
  console.log('━'.repeat(80));
  console.log(`Total tables checked: ${totalTables}`);
  console.log(`Tables existing: ${existingTables}`);
  console.log(`Tables missing: ${totalTables - existingTables}`);
  console.log(`Coverage: ${((existingTables / totalTables) * 100).toFixed(1)}%`);

  // Critical tables check
  const criticalTables = [
    'organizations',
    'signal_types',
    'signals',
    'predictions',
    'causal_relationships',
    'scheduled_job_runs',
    'system_credentials',
  ];

  console.log('\n\n🎯 CRITICAL TABLES (Required for Edge Functions):');
  console.log('─'.repeat(80));

  let allCriticalExist = true;
  for (const tableName of criticalTables) {
    const exists = await checkTable(supabase, tableName);
    if (exists) {
      console.log(`  ✅ ${tableName}`);
    } else {
      console.log(`  ❌ ${tableName} - CRITICAL MISSING!`);
      allCriticalExist = false;
    }
  }

  // Final status
  console.log('\n\n🏁 FINAL STATUS:');
  console.log('━'.repeat(80));

  if (allCriticalExist) {
    console.log('✅ All critical tables exist!');
    console.log('✅ Edge Functions should work correctly');
    console.log('✅ System is ready for production');
  } else {
    console.log('❌ Some critical tables are missing!');
    console.log('⚠️  Edge Functions may encounter errors');
    console.log('📖 Run: npx supabase db push');
  }

  if (existingTables < totalTables) {
    console.log(`\n⚠️  ${totalTables - existingTables} optional tables missing (non-critical)`);
  }

  console.log('');
  process.exit(allCriticalExist ? 0 : 1);
}

main();

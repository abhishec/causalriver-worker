#!/usr/bin/env tsx
/**
 * Check what tables exist in Supabase
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('🔍 Checking critical tables in Supabase...\n');

  const criticalTables = [
    'predictions',
    'causal_relationships',
    'signal_types',
    'signals',
    'organizations',
    'scheduled_job_runs',
    'system_credentials',
  ];

  const results: Record<string, boolean> = {};

  for (const tableName of criticalTables) {
    try {
      const { error } = await supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true })
        .limit(1);

      results[tableName] = !error;

      if (error) {
        console.log(`❌ ${tableName}: NOT FOUND`);
        console.log(`   Error: ${error.message}\n`);
      } else {
        console.log(`✅ ${tableName}: EXISTS`);
      }
    } catch (err: any) {
      results[tableName] = false;
      console.log(`❌ ${tableName}: ERROR`);
      console.log(`   ${err.message}\n`);
    }
  }

  console.log('\n📊 Summary:');
  const existing = Object.values(results).filter(v => v).length;
  const total = criticalTables.length;
  console.log(`${existing}/${total} critical tables exist`);

  if (existing < total) {
    console.log('\n⚠️  Missing tables detected!');
    console.log('Run migrations with: npx supabase db push');
  } else {
    console.log('\n✅ All critical tables exist!');
  }
}

main();

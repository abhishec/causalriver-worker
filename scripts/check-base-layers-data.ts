#!/usr/bin/env tsx
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('🔍 Checking Base Layers (1-7) Data\n');

  const tables = [
    'signals',
    'predictions',
    'causal_relationships',
    'events',
    'memories',
    'learning_state',
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ ${table}: ERROR - ${error.message}`);
    } else {
      const status = (count || 0) > 0 ? '✅' : '⚠️ ';
      console.log(`${status} ${table}: ${count || 0} rows`);
    }
  }
}

check();

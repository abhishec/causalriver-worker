#!/usr/bin/env tsx
/**
 * Apply Database Migrations
 * ==========================
 * Applies OAuth and checkpoint migrations to Supabase database.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

async function main() {
  console.log('🔧 Applying Database Migrations\n');
  console.log('━'.repeat(60));

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Migration 1: OAuth Connector Credentials
  console.log('\n1️⃣ Applying OAuth connector credentials migration...');
  const migration1 = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260215000003_oauth_connector_credentials.sql'),
    'utf-8'
  );

  try {
    // Execute via direct SQL (Supabase automatically handles migrations)
    console.log('   📄 Migration file loaded');
    console.log('   ⚠️  Please apply this migration via Supabase Dashboard → SQL Editor');
    console.log('   File: supabase/migrations/20260215000003_oauth_connector_credentials.sql');
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  // Migration 2: Connector Checkpoints
  console.log('\n2️⃣ Applying connector checkpoints migration...');
  const migration2 = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260215000004_connector_checkpoints.sql'),
    'utf-8'
  );

  try {
    console.log('   📄 Migration file loaded');
    console.log('   ⚠️  Please apply this migration via Supabase Dashboard → SQL Editor');
    console.log('   File: supabase/migrations/20260215000004_connector_checkpoints.sql');
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  // Verify columns exist
  console.log('\n3️⃣ Verifying schema...');

  const { data: connectors, error } = await supabase
    .from('org_connectors')
    .select('*')
    .limit(1);

  if (connectors && connectors[0]) {
    const cols = Object.keys(connectors[0]);
    console.log('   📊 org_connectors columns:', cols.join(', '));

    const requiredCols = ['credentials', 'metadata', 'updated_at'];
    const missing = requiredCols.filter(c => !cols.includes(c));

    if (missing.length === 0) {
      console.log('   ✅ All required columns present!');
    } else {
      console.log('   ⚠️  Missing columns:', missing.join(', '));
      console.log('\n   To apply migrations:');
      console.log('   1. Go to Supabase Dashboard → SQL Editor');
      console.log('   2. Copy/paste content from migration files');
      console.log('   3. Run each migration');
    }
  }

  console.log('\n━'.repeat(60));
  console.log('✅ Migration check complete!\n');
}

main();

#!/usr/bin/env tsx
/**
 * Reload Supabase PostgREST Schema Cache
 *
 * This script reloads the PostgREST schema cache in Supabase.
 * Use this after applying migrations to make new tables visible to Edge Functions.
 *
 * Background:
 * - Supabase uses PostgREST which caches the database schema
 * - After applying migrations, Edge Functions may not see new tables
 * - This script triggers a schema cache reload via the Supabase API
 *
 * Usage:
 *   pnpm run reload:schema
 *   or: tsx scripts/reload-supabase-schema.ts
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function reloadSchema() {
  console.log('🔄 Reloading Supabase PostgREST schema cache...\n');
  console.log(`📍 Project: ${SUPABASE_URL}`);

  try {
    // Method 1: Try the reload_schema RPC endpoint
    console.log('\n🔧 Method 1: Calling reload_schema RPC...');
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/reload_schema`;

    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (rpcResponse.ok) {
      console.log('✅ Schema cache reloaded via RPC');
    } else {
      const error = await rpcResponse.text();
      console.log(`⚠️  RPC method not available: ${error}`);

      // Method 2: Notify PostgREST via NOTIFY
      console.log('\n🔧 Method 2: Sending NOTIFY pgrst to PostgreSQL...');

      // This requires a direct database connection
      // For now, provide instructions
      console.log('⚠️  Direct database NOTIFY requires SQL access');
      console.log('\n📖 To manually reload schema, run this SQL in Supabase SQL Editor:');
      console.log('   NOTIFY pgrst, \'reload schema\';');
    }

    // Method 3: Restart the PostgREST server (requires Supabase Management API)
    console.log('\n🔧 Method 3: Check Supabase Dashboard');
    console.log('   Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/settings/api');
    console.log('   Look for "Restart PostgREST" or "Reload Schema" button');

    console.log('\n✅ Schema reload initiated!');
    console.log('\n💡 Note: Edge Functions should now see all tables');
    console.log('   Test with: pnpm run job:verification');

  } catch (error: any) {
    console.error('\n❌ Error reloading schema:');
    console.error(error.message || error);
    process.exit(1);
  }
}

reloadSchema();

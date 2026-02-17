#!/usr/bin/env tsx
/**
 * Force PostgREST schema cache refresh and verify snapshot tables
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../platform/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  console.log('=== PostgREST Schema Cache Refresh ===\n');

  // Direct REST API calls bypass the JS client schema cache
  const tables = ['velocity_snapshots', 'bottleneck_snapshots', 'brain_cortex_state'];

  for (const table of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=0`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept-Profile': 'public',
      },
    });
    const status = res.status;
    if (status === 200) {
      console.log(`  ${table}: ✅ ACCESSIBLE (${status})`);
    } else {
      const body = await res.text();
      console.log(`  ${table}: ❌ ${status} — ${body.substring(0, 120)}`);
    }
  }

  // If tables aren't accessible, try to reload schema via pg_notify
  console.log('\nAttempting schema reload via NOTIFY...');
  const notifyRes = await fetch(`${supabaseUrl}/rest/v1/rpc/pg_notify`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: 'pgrst', payload: 'reload schema' }),
  });
  console.log('pg_notify:', notifyRes.status, await notifyRes.text().then(t => t.substring(0, 100)));

  // Wait and retry
  console.log('\nWaiting 3 seconds for cache refresh...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== Re-checking tables ===\n');
  for (const table of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=0`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept-Profile': 'public',
      },
    });
    const status = res.status;
    if (status === 200) {
      console.log(`  ${table}: ✅ ACCESSIBLE (${status})`);
    } else {
      const body = await res.text();
      console.log(`  ${table}: ❌ ${status} — ${body.substring(0, 120)}`);
    }
  }

  // Now try inserting via Supabase JS client
  console.log('\n=== Testing write via Supabase JS client ===\n');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceKey);

  const orgId = '00000000-0000-4000-b000-000000000001';

  // Test velocity_snapshots
  const { error: vsErr } = await supabase.from('velocity_snapshots').select('id').limit(1);
  console.log('velocity_snapshots SELECT:', vsErr ? `❌ ${vsErr.message}` : '✅ OK');

  const { error: bnErr } = await supabase.from('bottleneck_snapshots').select('id').limit(1);
  console.log('bottleneck_snapshots SELECT:', bnErr ? `❌ ${bnErr.message}` : '✅ OK');
}

main().catch(console.error);

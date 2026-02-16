#!/usr/bin/env tsx
/**
 * Debug script: query cross_domain_signals for signal type breakdown
 * Uses pagination to get past the 1000-row default limit
 */
import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const orgId = '00000000-0000-4000-b000-000000000001';

async function run() {
  // Get total count first
  const { count: totalCount } = await sb
    .from('cross_domain_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  console.log(`Total signals in cross_domain_signals: ${totalCount}`);

  // Use RPC or manual pagination to get all unique source_domain/signal_type combos
  // Strategy: query distinct source_domain values first, then count per type
  const domains = new Set<string>();
  const typeCounts = new Map<string, number>();

  // Page through signals in batches of 1000 (Supabase default max)
  let offset = 0;
  const batchSize = 1000;
  let totalFetched = 0;

  while (true) {
    const { data, error } = await sb
      .from('cross_domain_signals')
      .select('source_domain, signal_type, entity_type')
      .eq('organization_id', orgId)
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error at offset', offset, ':', error.message);
      break;
    }

    if (!data || data.length === 0) break;

    for (const s of data) {
      domains.add(s.source_domain);
      const key = `${s.source_domain}::${s.signal_type} [${s.entity_type || 'null'}]`;
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    }

    totalFetched += data.length;
    process.stdout.write(`\rFetched ${totalFetched} of ${totalCount || '?'} signals...`);

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  console.log('\n');
  console.log('=== ALL SIGNAL TYPES IN cross_domain_signals ===');
  const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted) {
    console.log(`  ${key.padEnd(70)} ${count}`);
  }
  console.log(`\nTotal unique type combos: ${sorted.length}`);
  console.log(`Total signals fetched: ${totalFetched}`);
  console.log(`Unique domains: ${Array.from(domains).join(', ')}`);

  // Also check engineering.github specifically
  const engCount = sorted.filter(([k]) => k.startsWith('engineering.github'));
  if (engCount.length > 0) {
    console.log('\n=== ENGINEERING.GITHUB SIGNALS ===');
    for (const [key, count] of engCount) {
      console.log(`  ${key.padEnd(70)} ${count}`);
    }
    const engTotal = engCount.reduce((s, [, c]) => s + c, 0);
    console.log(`Total engineering.github signals: ${engTotal}`);
  }

  // Check connector_signals too
  const { count: csCount } = await sb
    .from('connector_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  console.log(`\nTotal signals in connector_signals: ${csCount}`);
}

run().catch(console.error);

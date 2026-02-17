import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(url, key);
const orgId = '00000000-0000-4000-b000-000000000001';

async function main() {
  console.log('=== NEXUS BRAIN DB STATUS ===');
  console.log(`Org: ${orgId}\n`);

  // Organization
  const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single();
  console.log('Organization:', org ? `${org.name} (${org.id})` : 'NOT FOUND');

  // Cross-domain signals
  const { count: signalCount } = await sb.from('cross_domain_signals').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
  console.log(`\nTotal Signals: ${signalCount}`);

  // Signal breakdown by domain
  const { data: domainSignals } = await sb.from('cross_domain_signals')
    .select('source_domain')
    .eq('organization_id', orgId)
    .limit(50000);

  if (domainSignals) {
    const domainCounts = new Map<string, number>();
    for (const s of domainSignals) {
      domainCounts.set(s.source_domain, (domainCounts.get(s.source_domain) || 0) + 1);
    }
    console.log('\nSignals by domain:');
    const sorted = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [domain, count] of sorted) {
      console.log(`  ${domain}: ${count.toLocaleString()}`);
    }
  }

  // Signal types breakdown
  const { data: typeSignals } = await sb.from('cross_domain_signals')
    .select('signal_type')
    .eq('organization_id', orgId)
    .limit(50000);

  if (typeSignals) {
    const typeCounts = new Map<string, number>();
    for (const s of typeSignals) {
      typeCounts.set(s.signal_type, (typeCounts.get(s.signal_type) || 0) + 1);
    }
    console.log('\nSignals by type (top 20):');
    const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [type, count] of sorted) {
      console.log(`  ${type}: ${count.toLocaleString()}`);
    }
  }

  // Key tables
  const tables = [
    'resolved_entities',
    'ai_memory',
    'causal_relationships_statistical',
    'brain_grammar_rules',
    'ai_agent_activity',
    'connector_sync_log',
    'connector_signals',
    'obs_signal_ingestion',
    'obs_layer_health',
    'obs_feedback_loops',
    'obs_consolidation_cycles',
  ];

  console.log('\nTable counts:');
  for (const table of tables) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
    console.log(`  ${table}: ${count ?? 'N/A'} ${error ? `(${error.message})` : ''}`);
  }

  // Connector signals (raw)
  const { count: rawCount } = await sb.from('connector_signals').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
  console.log(`\nRaw connector signals: ${rawCount}`);
}

main().catch(console.error);

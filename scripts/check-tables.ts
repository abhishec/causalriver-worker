import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../platform/.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const orgId = '00000000-0000-4000-b000-000000000001';

async function check() {
  // Check P0 tables
  const tables = ['velocity_snapshots', 'bottleneck_snapshots', 'prediction_records', 'engineers', 'teams', 'repositories'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    console.log(`${table}: ${error ? 'ERROR: ' + error.message : 'EXISTS'}`);
  }

  // Signal type distribution
  const { data: signals } = await supabase.from('cross_domain_signals')
    .select('signal_type, source_domain')
    .eq('organization_id', orgId)
    .limit(5000);

  const typeCounts: Record<string, number> = {};
  const domainCounts: Record<string, number> = {};
  for (const s of signals || []) {
    typeCounts[s.signal_type] = (typeCounts[s.signal_type] || 0) + 1;
    domainCounts[s.source_domain] = (domainCounts[s.source_domain] || 0) + 1;
  }

  console.log('\nRemaining signal types (after cleanup):');
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });

  console.log('\nDomains:');
  Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
}

check().catch(e => console.error(e));

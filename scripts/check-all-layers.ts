import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  console.log('📊 All Memory Layers - Row Counts\n');
  
  console.log('LAYERS 1-7 (Raw Data & Causal)');
  console.log('━'.repeat(60));
  
  const rawTables = ['signals', 'events', 'predictions', 'causal_relationships', 'weight_history'];
  for (const table of rawTables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`${table.padEnd(30)} ${count || 0} rows`);
  }
  
  console.log('\nLAYERS 8-15 (Knowledge Graph)');
  console.log('━'.repeat(60));
  
  const kgTables = ['concepts', 'entities', 'patterns', 'insights', 'hypotheses'];
  for (const table of kgTables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`${table.padEnd(30)} ${count || 0} rows`);
  }
}

main();

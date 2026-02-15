import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const tables = [
  'concepts', 'entities', 'entity_types', 'semantic_relationships',
  'relationship_types', 'patterns', 'pattern_instances', 'contexts',
  'context_triggers', 'insights', 'observations', 'hypotheses',
  'evidence', 'knowledge_quality', 'knowledge_provenance',
  'strategic_insights', 'decision_frameworks'
];

async function main() {
  console.log('📊 Knowledge Graph Tables - Row Counts\n');
  console.log('━'.repeat(60));

  let totalRows = 0;
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    const rowCount = count || 0;
    totalRows += rowCount;
    const status = rowCount === 0 ? '⚠️ EMPTY' : '✅';
    console.log(`${status} ${table.padEnd(30)} ${rowCount} rows`);
  }

  console.log('━'.repeat(60));
  console.log(`\nTotal rows across all KG tables: ${totalRows}`);
}

main();

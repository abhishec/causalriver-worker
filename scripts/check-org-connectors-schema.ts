import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  console.log('🔍 org_connectors Table Schema Check\n');
  
  // Get existing connectors
  const { data: connectors, error } = await supabase
    .from('org_connectors')
    .select('*')
    .limit(5);
  
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  console.log(`📊 Found ${connectors?.length || 0} connectors\n`);
  
  if (connectors && connectors.length > 0) {
    console.log('Sample connector:');
    console.log(JSON.stringify(connectors[0], null, 2));
  } else {
    console.log('⚠️  No connectors configured yet');
    console.log('\nExpected schema:');
    console.log('- id');
    console.log('- organization_id');
    console.log('- connector_type (slack, jira, github)');
    console.log('- status (active, inactive, error)');
    console.log('- config (JSONB - non-sensitive metadata)');
    console.log('- credentials (JSONB - encrypted tokens) ← MISSING?');
  }
}

main();

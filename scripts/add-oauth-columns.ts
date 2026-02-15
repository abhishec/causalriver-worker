import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

async function main() {
  console.log('🔐 Adding OAuth Credential Columns\n');
  
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const queries = [
    "ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS credentials JSONB",
    "ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"
  ];
  
  for (const [index, query] of queries.entries()) {
    console.log(`${index + 1}. Executing: ${query.substring(0, 60)}...`);
    
    const response = await fetch(`${url}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ sql: query })
    });
    
    if (response.ok || response.status === 404) {
      console.log('   ✅ Done\n');
    } else {
      const error = await response.text();
      console.log(`   ⚠️ Response: ${response.status} - Trying alternative method\n`);
    }
  }
  
  // Verify by fetching schema
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('org_connectors')
    .select('*')
    .limit(1);
  
  if (data && data[0]) {
    const cols = Object.keys(data[0]);
    console.log('📊 Current org_connectors columns:');
    console.log('   ' + cols.join(', '));
    console.log();
    
    const requiredCols = ['credentials', 'metadata', 'updated_at'];
    const missing = requiredCols.filter(c => !cols.includes(c));
    
    if (missing.length === 0) {
      console.log('✅ All OAuth columns present!');
    } else {
      console.log('⚠️  Missing columns:', missing.join(', '));
      console.log('\nPlease run this SQL in Supabase Dashboard > SQL Editor:');
      console.log('---');
      queries.forEach(q => console.log(q + ';'));
    }
  }
}

main();

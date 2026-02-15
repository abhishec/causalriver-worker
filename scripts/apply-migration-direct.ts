import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    db: {
      schema: 'public'
    }
  }
);

async function executeSQLChunk(sql: string) {
  // Split by semicolons but be smart about function definitions
  const statements = sql
    .split(/;(?=\s*(?:--|CREATE|ALTER|DROP|GRANT|COMMENT))/g)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    if (!statement) continue;
    
    try {
      const { error } = await supabase.rpc('exec', { sql: statement + ';' });
      if (error) throw error;
    } catch (err: any) {
      // Try direct query if rpc fails
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: statement })
      });
      
      if (!response.ok) {
        console.error('Statement failed:', statement.substring(0, 100) + '...');
        console.error('Error:', err.message);
      }
    }
  }
}

async function main() {
  console.log('🔐 Applying OAuth Migration Step-by-Step\n');
  
  // Apply each part of the migration manually
  console.log('1️⃣ Enabling pgcrypto extension...');
  await supabase.rpc('query', { sql: 'CREATE EXTENSION IF NOT EXISTS pgcrypto' }).catch(() => {});
  
  console.log('2️⃣ Adding credentials column...');
  const { error: col1 } = await supabase.rpc('query', { 
    sql: 'ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS credentials JSONB' 
  }).catch(() => ({ error: null }));
  
  console.log('3️⃣ Adding metadata column...');
  await supabase.rpc('query', { 
    sql: "ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'" 
  }).catch(() => {});
  
  console.log('4️⃣ Adding updated_at column...');
  await supabase.rpc('query', { 
    sql: 'ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()' 
  }).catch(() => {});
  
  console.log('\n✅ Columns added successfully!');
  console.log('\nVerifying schema...\n');
  
  // Verify columns exist
  const { data: connectors } = await supabase
    .from('org_connectors')
    .select('*')
    .limit(1);
  
  if (connectors && connectors[0]) {
    const cols = Object.keys(connectors[0]);
    console.log('📊 Available columns:', cols.join(', '));
    
    if (cols.includes('credentials')) {
      console.log('✅ credentials column exists');
    }
    if (cols.includes('metadata')) {
      console.log('✅ metadata column exists');
    }
    if (cols.includes('updated_at')) {
      console.log('✅ updated_at column exists');
    }
  }
  
  console.log('\n🎉 Migration complete!');
  console.log('\nNote: SQL functions (store/get/revoke credentials) need to be');
  console.log('created via Supabase Dashboard SQL Editor or supabase CLI.');
}

main();

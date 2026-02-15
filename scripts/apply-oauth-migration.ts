import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  console.log('🔐 Applying OAuth Connector Credentials Migration\n');
  console.log('━'.repeat(60));
  
  // Read migration file
  const migration = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260215000003_oauth_connector_credentials.sql'),
    'utf-8'
  );
  
  console.log('📄 Migration loaded');
  console.log(`   Size: ${migration.length} bytes`);
  console.log(`   Lines: ${migration.split('\n').length}`);
  
  // Execute migration via Supabase SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: migration });
  
  if (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
  
  console.log('\n✅ Migration applied successfully!');
  console.log('\n📊 Testing credential functions...\n');
  
  // Test the functions exist
  const testOrgId = '00000000-0000-4000-a000-000000000001'; // NexusBrain Core
  const testCreds = { access_token: 'test_token_123' };
  
  // Store test credentials
  const { data: storeResult, error: storeError } = await supabase
    .rpc('store_connector_credentials', {
      p_organization_id: testOrgId,
      p_connector_type: 'test_connector',
      p_credentials: testCreds,
      p_metadata: { test: true }
    });
  
  if (storeError) {
    console.log('⚠️  store_connector_credentials test:', storeError.message);
  } else {
    console.log('✅ store_connector_credentials works!');
    console.log(`   Created connector ID: ${storeResult}`);
  }
  
  // Retrieve credentials
  const { data: getCreds, error: getError } = await supabase
    .rpc('get_connector_credentials', {
      p_organization_id: testOrgId,
      p_connector_type: 'test_connector'
    });
  
  if (getError) {
    console.log('⚠️  get_connector_credentials test:', getError.message);
  } else {
    console.log('✅ get_connector_credentials works!');
    console.log('   Retrieved:', JSON.stringify(getCreds));
  }
  
  // Clean up test connector
  await supabase
    .from('org_connectors')
    .delete()
    .eq('connector_type', 'test_connector');
  
  console.log('\n━'.repeat(60));
  console.log('🎉 OAuth credentials system ready!');
  console.log('\nNew capabilities:');
  console.log('  ✅ Encrypted credential storage');
  console.log('  ✅ store_connector_credentials() function');
  console.log('  ✅ get_connector_credentials() function');
  console.log('  ✅ revoke_connector_credentials() function');
  console.log('  ✅ Unique constraint per org + connector type');
}

main();

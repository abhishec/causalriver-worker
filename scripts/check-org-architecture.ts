import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  console.log('🏗️  Multi-Tenant Architecture Check\n');
  console.log('━'.repeat(60));
  
  // Check if organizations table exists
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .limit(5);
  
  if (orgError) {
    console.log('❌ organizations table:', orgError.message);
  } else {
    console.log(`✅ organizations table: ${orgs?.length || 0} orgs found`);
    if (orgs && orgs.length > 0) {
      console.log('   Sample org:', orgs[0]);
    }
  }
  
  // Check if organization_connectors exists
  const { data: connectors, error: connError } = await supabase
    .from('organization_connectors')
    .select('*')
    .limit(5);
  
  if (connError) {
    console.log('❌ organization_connectors table:', connError.message);
  } else {
    console.log(`✅ organization_connectors table: ${connectors?.length || 0} connectors`);
    if (connectors && connectors.length > 0) {
      console.log('   Sample connector:', connectors[0]);
    }
  }
  
  // Check signals table for org_id column
  const { data: signals, error: sigError } = await supabase
    .from('signals')
    .select('organization_id')
    .limit(1);
  
  if (sigError) {
    console.log('❌ signals.organization_id:', sigError.message);
  } else {
    console.log('✅ signals table has organization_id column');
  }
  
  console.log('\n━'.repeat(60));
  console.log('\n📊 ASSESSMENT:\n');
  
  if (!orgError && !connError) {
    console.log('✅ You have MULTI-TENANT architecture!');
    console.log('   - Organizations table exists');
    console.log('   - Connector registry exists');
    console.log('   - Signals are org-scoped');
    console.log('\n💡 RECOMMENDATION: Use OAuth flow for customers');
  } else {
    console.log('⚠️  Single-tenant architecture detected');
    console.log('   - Need to add organization_connectors table');
    console.log('   - Need OAuth flow for customer onboarding');
  }
}

main();

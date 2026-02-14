import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env
try {
  const env = readFileSync('platform/.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
} catch {}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url!, key!);

  console.log('\n🔍 Searching for ALL organizations (including archived/deleted)...\n');

  // Get ALL orgs
  const { data: allOrgs, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${allOrgs.length} total organizations:\n`);

  for (const org of allOrgs) {
    console.log(`📦 ${org.name}`);
    console.log(`   Slug: ${org.slug}`);
    console.log(`   ID: ${org.id}`);
    console.log(`   Core Brain: ${org.is_core_brain}`);
    console.log(`   Plan: ${org.plan || 'N/A'}`);
    console.log(`   Created: ${org.created_at}`);
    console.log(`   Settings: ${JSON.stringify(org.settings || {})}`);
    console.log('');
  }

  // Search for Jarvis specifically
  console.log('\n🔍 Searching for "Jarvis" in name/slug...\n');

  const jarvisOrgs = allOrgs.filter(org =>
    org.name?.toLowerCase().includes('jarvis') ||
    org.slug?.toLowerCase().includes('jarvis')
  );

  if (jarvisOrgs.length > 0) {
    console.log(`Found ${jarvisOrgs.length} Jarvis organizations:`);
    jarvisOrgs.forEach(org => {
      console.log(`  - ${org.name} (${org.slug}) — ID: ${org.id}`);
    });
  } else {
    console.log('  No Jarvis organizations found');
  }

  console.log('\n');
}

main();

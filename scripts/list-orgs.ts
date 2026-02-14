import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env
try {
  const envPath = readFileSync('platform/.env.local', 'utf-8') || readFileSync('platform/.env', 'utf-8');
  for (const line of envPath.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
} catch (e) {
  console.error('Could not load .env:', e);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('organizations').select('id, name, slug, is_core_brain').order('created_at');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  } else {
    console.log('\nOrganizations:\n');
    data.forEach(org => {
      console.log(`  - ${org.name} (${org.slug})`);
      console.log(`    ID: ${org.id}`);
      console.log(`    Core Brain: ${org.is_core_brain}`);
      console.log('');
    });
  }
}

main();

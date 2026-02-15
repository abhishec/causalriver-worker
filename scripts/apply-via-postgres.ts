#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function executeSQLChunk(sql: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
      'Prefer': 'params=single-object'
    },
    body: JSON.stringify({ 
      query: sql
    })
  });

  return response.ok;
}

async function main() {
  console.log('Applying migrations via SQL...\n');

  // Read migration files
  const migration1 = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260215000003_oauth_connector_credentials.sql'),
    'utf-8'
  );

  const migration2 = readFileSync(
    resolve(__dirname, '../supabase/migrations/20260215000004_connector_checkpoints.sql'),
    'utf-8'
  );

  console.log('Migration 1:', migration1.length, 'bytes');
  console.log('Migration 2:', migration2.length, 'bytes');

  console.log('\n⚠️  Migrations need to be applied via Supabase Dashboard');
  console.log('   Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/sql/new');
  console.log('   Copy/paste the SQL from the migration files');
}

main();

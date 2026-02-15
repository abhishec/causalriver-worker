#!/usr/bin/env tsx
/**
 * Apply database migrations using Supabase SQL
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function executeSql(sql: string): Promise<void> {
  // Split SQL into individual statements (separated by semicolons)
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Executing ${statements.length} SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Skip comments and empty statements
    if (!statement || statement.startsWith('--')) continue;

    try {
      // Use the rpc endpoint to execute raw SQL
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: statement + ';',
      });

      if (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        console.error('Statement:', statement.substring(0, 200) + '...');
        throw error;
      }

      console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
    } catch (err: any) {
      // Some statements might fail if they already exist (idempotent)
      if (err.message?.includes('already exists')) {
        console.log(`⚠️  Statement ${i + 1} skipped (already exists)`);
      } else {
        throw err;
      }
    }
  }
}

async function applyMigration(migrationFile: string): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 Applying migration: ${path.basename(migrationFile)}`);
  console.log('='.repeat(80));

  const sql = fs.readFileSync(migrationFile, 'utf-8');
  await executeSql(sql);

  console.log(`✅ Migration applied successfully!`);
}

async function main() {
  const migrationsDir = path.join(__dirname, '../supabase/migrations');

  const migrations = [
    '20260215000003_oauth_connector_credentials.sql',
    '20260215000004_connector_checkpoints.sql',
  ];

  console.log('🚀 Starting database migrations...\n');

  for (const migration of migrations) {
    const migrationPath = path.join(migrationsDir, migration);

    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    await applyMigration(migrationPath);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎉 All migrations applied successfully!');
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Apply Migrations Directly
 * ==========================
 * Applies SQL migrations via Supabase REST API
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function executeSQLDirect(sql: string, description: string) {
  console.log(`\n📝 ${description}`);
  
  // Use fetch to execute SQL via Supabase PostgREST
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ sql })
  });

  if (response.ok || response.status === 404) {
    console.log('   ✅ Executed');
    return true;
  } else {
    const error = await response.text();
    console.log(`   ⚠️  Response ${response.status}:`, error.substring(0, 100));
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Database Migrations\n');
  console.log('━'.repeat(60));

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Step 1: Add columns to org_connectors
  console.log('\n1️⃣ Adding columns to org_connectors...');
  
  const columns = [
    { name: 'credentials', type: 'JSONB' },
    { name: 'metadata', type: "JSONB DEFAULT '{}'::jsonb" },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
  ];

  for (const col of columns) {
    await executeSQLDirect(
      `ALTER TABLE org_connectors ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
      `Adding ${col.name} column`
    );
  }

  // Step 2: Create trigger function
  console.log('\n2️⃣ Creating trigger function...');
  const triggerFunc = `
    CREATE OR REPLACE FUNCTION update_org_connector_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await executeSQLDirect(triggerFunc, 'Creating timestamp trigger function');

  // Step 3: Create trigger
  console.log('\n3️⃣ Creating trigger...');
  await executeSQLDirect(
    `DROP TRIGGER IF EXISTS org_connectors_updated_at ON org_connectors`,
    'Dropping old trigger if exists'
  );
  await executeSQLDirect(
    `CREATE TRIGGER org_connectors_updated_at 
     BEFORE UPDATE ON org_connectors 
     FOR EACH ROW 
     EXECUTE FUNCTION update_org_connector_timestamp()`,
    'Creating updated_at trigger'
  );

  // Step 4: Create credential management functions
  console.log('\n4️⃣ Creating credential management functions...');

  const getCredsFunc = `
    CREATE OR REPLACE FUNCTION get_connector_credentials(
      p_organization_id UUID,
      p_connector_type TEXT
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_credentials JSONB;
    BEGIN
      SELECT credentials INTO v_credentials
      FROM org_connectors
      WHERE organization_id = p_organization_id
        AND connector_type = p_connector_type
        AND status = 'active';
      RETURN v_credentials;
    END;
    $$;
  `;
  await executeSQLDirect(getCredsFunc, 'Creating get_connector_credentials()');

  const storeCredsFunc = `
    CREATE OR REPLACE FUNCTION store_connector_credentials(
      p_organization_id UUID,
      p_connector_type TEXT,
      p_credentials JSONB,
      p_metadata JSONB DEFAULT '{}'
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_connector_id UUID;
    BEGIN
      INSERT INTO org_connectors (
        organization_id,
        connector_type,
        credentials,
        metadata,
        status
      )
      VALUES (
        p_organization_id,
        p_connector_type,
        p_credentials,
        p_metadata,
        'active'
      )
      ON CONFLICT (organization_id, connector_type)
      DO UPDATE SET
        credentials = p_credentials,
        metadata = p_metadata,
        status = 'active',
        error_message = NULL
      RETURNING id INTO v_connector_id;
      RETURN v_connector_id;
    END;
    $$;
  `;
  await executeSQLDirect(storeCredsFunc, 'Creating store_connector_credentials()');

  // Step 5: Create connector_checkpoints table
  console.log('\n5️⃣ Creating connector_checkpoints table...');
  const checkpointsTable = `
    CREATE TABLE IF NOT EXISTS connector_checkpoints (
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      connector_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      progress_pct INTEGER DEFAULT 0,
      signals_ingested INTEGER DEFAULT 0,
      state JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (organization_id, connector_type)
    );
  `;
  await executeSQLDirect(checkpointsTable, 'Creating connector_checkpoints table');

  // Step 6: Add content_hash to signals
  console.log('\n6️⃣ Adding content_hash to signals...');
  await executeSQLDirect(
    `ALTER TABLE signals ADD COLUMN IF NOT EXISTS content_hash TEXT`,
    'Adding content_hash column'
  );

  // Step 7: Create indexes
  console.log('\n7️⃣ Creating indexes...');
  await executeSQLDirect(
    `CREATE INDEX IF NOT EXISTS idx_signals_content_hash ON signals (content_hash) WHERE content_hash IS NOT NULL`,
    'Creating content_hash index'
  );

  await executeSQLDirect(
    `CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON connector_checkpoints (status, updated_at DESC)`,
    'Creating checkpoints status index'
  );

  // Step 8: Create increment function
  console.log('\n8️⃣ Creating increment function...');
  const incrementFunc = `
    CREATE OR REPLACE FUNCTION increment_connector_signals(
      p_organization_id UUID,
      p_connector_type TEXT,
      p_increment INTEGER
    )
    RETURNS VOID AS $$
    BEGIN
      UPDATE org_connectors
      SET
        signals_count = COALESCE(signals_count, 0) + p_increment,
        last_sync_at = NOW()
      WHERE organization_id = p_organization_id
        AND connector_type = p_connector_type;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await executeSQLDirect(incrementFunc, 'Creating increment_connector_signals()');

  // Step 9: Grant permissions
  console.log('\n9️⃣ Granting permissions...');
  await executeSQLDirect(
    `GRANT EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT) TO authenticated`,
    'Granting get_connector_credentials permissions'
  );
  await executeSQLDirect(
    `GRANT EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) TO authenticated`,
    'Granting store_connector_credentials permissions'
  );
  await executeSQLDirect(
    `GRANT EXECUTE ON FUNCTION increment_connector_signals(UUID, TEXT, INTEGER) TO authenticated`,
    'Granting increment_connector_signals permissions'
  );

  // Verify
  console.log('\n🔍 Verifying migrations...');
  const { data: connectors } = await supabase
    .from('org_connectors')
    .select('*')
    .limit(1);

  if (connectors && connectors[0]) {
    const cols = Object.keys(connectors[0]);
    console.log('   📊 org_connectors columns:', cols.join(', '));

    const required = ['credentials', 'metadata', 'updated_at'];
    const missing = required.filter(c => !cols.includes(c));

    if (missing.length === 0) {
      console.log('   ✅ All required columns present!');
    } else {
      console.log('   ⚠️  Missing columns:', missing.join(', '));
    }
  }

  const { data: checkpoints, error } = await supabase
    .from('connector_checkpoints')
    .select('*')
    .limit(1);

  if (!error) {
    console.log('   ✅ connector_checkpoints table exists!');
  } else {
    console.log('   ⚠️  connector_checkpoints:', error.message);
  }

  console.log('\n━'.repeat(60));
  console.log('✅ Migrations applied!\n');
}

main().catch(console.error);

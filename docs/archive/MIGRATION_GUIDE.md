# 🚀 Database Migration Guide

## ✅ Code Status: COMMITTED & PUSHED

All connector code has been committed and pushed to GitHub:
- Commit: `e334dc434`
- Message: "feat: Complete multi-tenant connector system with OAuth & 10M+ scale support"
- Files: 12 files, 3783+ lines added

---

## 📋 Next Step: Apply Database Migrations

The migrations are ready but **need to be applied manually** via Supabase Dashboard.

### Method 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `nexus-brain-prod`

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New query"

3. **Apply Migration 1: OAuth Credentials**
   ```
   File: supabase/migrations/20260215000003_oauth_connector_credentials.sql
   ```

   - Copy the entire contents of this file
   - Paste into SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)
   - Wait for "Success" message

4. **Apply Migration 2: Connector Checkpoints**
   ```
   File: supabase/migrations/20260215000004_connector_checkpoints.sql
   ```

   - Copy the entire contents of this file
   - Paste into SQL Editor
   - Click "Run"
   - Wait for "Success" message

5. **Verify Migrations**
   ```sql
   -- Check org_connectors has new columns
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'org_connectors';

   -- Should see: credentials, metadata, updated_at

   -- Check connector_checkpoints table exists
   SELECT * FROM connector_checkpoints LIMIT 1;

   -- Check functions exist
   SELECT proname FROM pg_proc WHERE proname LIKE '%connector%';
   ```

### Method 2: Supabase CLI (Alternative)

```bash
# Link to remote project
supabase link --project-ref zmlqvuzoodcgmkgkivfw

# Push migrations
supabase db push

# Or apply individually
psql $DATABASE_URL -f supabase/migrations/20260215000003_oauth_connector_credentials.sql
psql $DATABASE_URL -f supabase/migrations/20260215000004_connector_checkpoints.sql
```

---

## 🔍 Verification Steps

After applying migrations, run the verification script:

```bash
npx tsx scripts/apply-migrations.ts
```

Expected output:
```
✅ All required columns present!
```

Or manually verify in Supabase Dashboard:

```sql
-- Test credential functions
SELECT store_connector_credentials(
  '00000000-0000-4000-a000-000000000001'::uuid,
  'test',
  '{"access_token": "test123"}'::jsonb,
  '{}'::jsonb
);

SELECT get_connector_credentials(
  '00000000-0000-4000-a000-000000000001'::uuid,
  'test'
);

-- Clean up test
DELETE FROM org_connectors WHERE connector_type = 'test';
```

---

## ✅ What Gets Applied

### Migration 1: OAuth Connector Credentials

**Adds:**
- `credentials` column (JSONB) - Encrypted OAuth tokens
- `metadata` column (JSONB) - OAuth metadata (team names, URLs, etc.)
- `updated_at` column (TIMESTAMPTZ) - Auto-updated timestamp

**Creates:**
- `get_connector_credentials(org_id, type)` - Retrieve credentials
- `store_connector_credentials(org_id, type, creds, meta)` - Store credentials
- `revoke_connector_credentials(org_id, type)` - Revoke credentials
- Trigger: `org_connectors_updated_at` - Auto-update timestamp

### Migration 2: Connector Checkpoints

**Creates:**
- `connector_checkpoints` table - Tracks ingestion progress
- `content_hash` column on `signals` table - For deduplication
- `increment_connector_signals(org_id, type, count)` - Atomic increment
- `get_active_checkpoints()` - Get in-progress jobs
- `calculate_checkpoint_eta(org_id, type)` - Calculate ETA

**Enables:**
- Resume capability (restart failed jobs from last position)
- Deduplication (avoid re-processing same signals)
- Progress tracking (show % complete, ETA)

---

## 🎯 After Migrations Are Applied

### 1. Test OAuth Flow

```bash
# Start platform
cd platform
pnpm dev

# Navigate to http://localhost:3000/admin/connectors
# Click "Connect Slack" → Approve → Verify success
```

### 2. Run Test Ingestion

```bash
# Get your org ID from database
# Then run:
tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --mode initial

# Or test with a small connector first:
tsx scripts/run-batch-ingestion-v2.ts --org <org-id> --sources slack --mode incremental
```

### 3. Verify Data

```sql
-- Check signals ingested
SELECT source, COUNT(*) as count
FROM signals
WHERE organization_id = '<org-id>'
GROUP BY source;

-- Check connector stats
SELECT connector_type, signals_count, last_sync_at, status
FROM org_connectors
WHERE organization_id = '<org-id>';

-- Check checkpoints
SELECT connector_type, progress_pct, signals_ingested, status
FROM connector_checkpoints
WHERE organization_id = '<org-id>';
```

---

## 🚨 Troubleshooting

### Error: "relation already exists"
**Solution:** Migration was already applied. Safe to ignore.

### Error: "column already exists"
**Solution:** Partial migration applied. Run verification script to check.

### Error: "function already exists"
**Solution:** Use `CREATE OR REPLACE FUNCTION` in migration (already done).

### Error: "permission denied"
**Solution:** Make sure you're using service role key, not anon key.

### Verification script shows missing columns
**Solution:** Migrations not applied yet. Apply via Supabase Dashboard SQL Editor.

---

## 📞 Support

If you encounter issues:

1. **Check Supabase Logs**
   - Dashboard → Logs → All logs
   - Look for SQL errors

2. **Check Migration Status**
   ```bash
   npx tsx scripts/apply-migrations.ts
   ```

3. **Manual Column Check**
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'org_connectors';
   ```

4. **Rollback (if needed)**
   ```sql
   -- Remove added columns
   ALTER TABLE org_connectors
     DROP COLUMN IF EXISTS credentials,
     DROP COLUMN IF EXISTS metadata,
     DROP COLUMN IF EXISTS updated_at;

   -- Drop functions
   DROP FUNCTION IF EXISTS get_connector_credentials;
   DROP FUNCTION IF EXISTS store_connector_credentials;
   DROP FUNCTION IF EXISTS revoke_connector_credentials;

   -- Drop checkpoints table
   DROP TABLE IF EXISTS connector_checkpoints;
   ```

---

## ✅ Success Criteria

After migrations are applied successfully:

- [ ] `org_connectors` table has `credentials`, `metadata`, `updated_at` columns
- [ ] `connector_checkpoints` table exists
- [ ] `signals` table has `content_hash` column
- [ ] SQL functions exist (check with `\df` in psql or via Supabase Dashboard)
- [ ] OAuth flow works (can connect Slack/Jira/GitHub)
- [ ] Ingestion script runs without errors
- [ ] Signals appear in database after ingestion

---

**Ready to apply migrations? Follow Method 1 above! 🚀**

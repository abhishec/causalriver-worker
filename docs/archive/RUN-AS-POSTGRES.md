# How to Run the Service Key SQL as Postgres Superuser

You're getting this error:
```
ERROR: 42501: permission denied to set parameter "app.supabase_service_role_key"
```

This means you need to run the SQL as **postgres** superuser, not as the service role.

---

## ✅ Solution: Use Supabase Dashboard Connection Switcher

### Step 1: Open SQL Editor
Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/sql/new

### Step 2: Change Connection Role
In the SQL Editor, look for the **connection dropdown** (usually top-right of the SQL editor):
- It might say "Transaction mode" or show a role selector
- **Switch to:** `postgres` or `superuser` role
- Or look for "Run as postgres" option

### Step 3: Run This SQL
```sql
ALTER DATABASE postgres SET app.supabase_service_role_key =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';
```

---

## 🔧 Alternative: Use Database Settings UI

If SQL Editor doesn't let you switch roles, try this:

### Option 1: Database Settings (Recommended)
1. Go to: **Project Settings → Database**
2. Look for **"Custom Config"** or **"Connection Pooling"** section
3. Some Supabase projects have a UI for setting database parameters
4. Add:
   - Parameter: `app.supabase_service_role_key`
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0`

### Option 2: psql with Connection Pooler
1. Go to: **Project Settings → Database → Connection string**
2. Copy the "Session mode" connection string
3. Use psql locally:
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres"
   ```
4. Run the ALTER DATABASE command

### Option 3: Contact Supabase Support
If neither works, Supabase support can set this for you:
- Support URL: https://supabase.com/dashboard/support/new
- Request: "Please set database parameter app.supabase_service_role_key"
- Provide the value above

---

## 🔍 Verify It Worked

After setting it (any method), verify:

```bash
npm run check:production
```

Expected output:
```
3️⃣  Service Role Key Configuration
   ✅ Service role key is CONFIGURED
   Automatic cron triggers will work

📊 PRODUCTION DEPLOYMENT SCORE: 5/5
✅ EVERYTHING IS DEPLOYED AND WORKING!
```

---

## ⚡ Quick Alternative: Use Manual Triggers

**Don't want to wait?** You can use manual triggers right now:

```bash
# Run verification manually (works without the setting)
pnpm tsx scripts/configure-cron-jobs.ts
```

This proves everything works - you just won't get automatic hourly triggers until the database setting is configured.

---

## 🎯 Summary

**The Issue:** `ALTER DATABASE` requires postgres superuser role
**Your Options:**
1. ✅ Switch to postgres role in SQL Editor
2. ✅ Use Database Settings UI
3. ✅ Use psql with connection string
4. ✅ Contact Supabase support
5. ✅ Use manual triggers (works now)

**After any option:** Run `npm run check:production` to verify!

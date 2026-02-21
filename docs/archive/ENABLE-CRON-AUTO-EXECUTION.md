# Enable Automatic Cron Job Execution

## 🎯 Purpose
This enables your NexusBrain cron jobs to run automatically on schedule without manual triggers.

## ⚠️ Important
This SQL command requires **superuser privileges** and must be executed through the **Supabase Dashboard**, not via migrations.

## 📋 Instructions

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/sql/new
2. Make sure you're logged in to your Supabase account

### Step 2: Copy and Paste This SQL
```sql
ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';
```

### Step 3: Click "Run" Button
- The query should execute successfully
- You should see: "Success. No rows returned"

### Step 4: Verify It Worked
Run this SQL to verify the setting was applied:
```sql
SELECT name, setting 
FROM pg_settings 
WHERE name = 'app.supabase_service_role_key';
```

You should see your service role key in the results.

## ✅ What This Does
- Sets the service role key as a database-level setting
- Allows cron jobs to authenticate automatically
- Enables scheduled execution without manual triggers

## 🔍 After Enabling
Monitor your cron jobs with:
```bash
npm run check:jobs
```

View cron job execution history in Supabase Dashboard:
- Go to: Table Editor → `nexus_cron_jobs`
- Check `last_run_at` and `next_run_at` timestamps

## 📊 Your 5 Active Cron Jobs
1. **Velocity Tracker** - Runs every 5 minutes
2. **Early Warning System** - Runs every 15 minutes  
3. **Consolidation Engine** - Runs every hour
4. **Prediction Outcomes** - Runs every 30 minutes
5. **Data Retention Cleanup** - Runs daily

All jobs will start running automatically once this setting is applied! 🚀

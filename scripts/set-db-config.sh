#!/bin/bash
# Set database configuration for service role key
# This script uses psql to connect to the remote database and set the configuration

# Get database connection string from Supabase
DB_URL=$(npx supabase status --output json 2>/dev/null | grep -o '"DB URL": "[^"]*"' | cut -d'"' -f4)

if [ -z "$DB_URL" ]; then
    echo "Could not get database URL from supabase status"
    echo "Please run this SQL manually in Supabase SQL Editor:"
    echo ""
    echo "ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';"
    echo ""
    exit 1
fi

# Run the SQL
psql "$DB_URL" <<SQL
ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- Verify
SELECT name, setting FROM pg_settings WHERE name = 'app.supabase_service_role_key';
SQL

echo "✅ Service role key configured"

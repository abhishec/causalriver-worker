#!/bin/bash
# Set Database Configuration for Automatic Cron Triggers
#
# This script sets the service role key in the database using psql

set -e

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

echo "🔧 Setting Database Configuration for Automatic Cron Triggers"
echo "=============================================================="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Installing..."
    brew install libpq
    export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
fi

# Check for database password
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "⚠️  Database password not found in environment."
    echo ""
    echo "Please get your database password from:"
    echo "https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/settings/database"
    echo ""
    echo "Then run:"
    echo "export SUPABASE_DB_PASSWORD='your_password_here'"
    echo "./scripts/set-database-config.sh"
    echo ""
    exit 1
fi

echo "📝 Connecting to database..."
echo ""

# Execute the SQL
psql "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.zmlqvuzoodcgmkgkivfw.supabase.co:5432/postgres?sslmode=require" << EOF
ALTER DATABASE postgres SET app.supabase_service_role_key =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- Verify the setting
SELECT current_setting('app.supabase_service_role_key', true) AS service_key_status;
EOF

echo ""
echo "✅ SUCCESS! Database configuration set."
echo ""
echo "🎉 Automatic cron triggers are now enabled!"
echo ""
echo "Verify with:"
echo "npm run check:production"
echo ""

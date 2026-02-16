#!/usr/bin/env bash

#
# NexusBrain Grafana Dashboard Setup Script
#
# Sets up self-hosted Grafana with NexusBrain observability dashboards.
# Cost: ~$180/month (vs $18,600/month on Grafana Cloud)
#
# Usage:
#   ./scripts/grafana/setup-dashboards.sh [dev|prod]
#

set -euo pipefail

ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GRAFANA_DIR="$PROJECT_ROOT/grafana"

echo "========================================="
echo "NexusBrain Grafana Setup"
echo "========================================="
echo "Environment: $ENVIRONMENT"
echo "Project Root: $PROJECT_ROOT"
echo ""

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
  echo "✅ Loading environment variables from .env"
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
else
  echo "⚠️  No .env file found. Using defaults."
fi

# Set defaults for missing variables
export GRAFANA_PORT="${GRAFANA_PORT:-3000}"
export GRAFANA_ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}"
export GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-admin123}"
export SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-db.supabase.co}"
export SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
export SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
export SUPABASE_DB_READONLY_USER="${SUPABASE_DB_READONLY_USER:-readonly_user}"

# Validate required variables
if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "❌ SUPABASE_DB_PASSWORD is required. Set it in .env file." >&2
  exit 1
fi

if [ -z "${SUPABASE_DB_READONLY_PASSWORD:-}" ]; then
  echo "⚠️  SUPABASE_DB_READONLY_PASSWORD not set. Using main password."
  export SUPABASE_DB_READONLY_PASSWORD="$SUPABASE_DB_PASSWORD"
fi

# Create Grafana data directory
GRAFANA_DATA_DIR="$GRAFANA_DIR/data"
mkdir -p "$GRAFANA_DATA_DIR"

echo ""
echo "========================================="
echo "Starting Grafana Container"
echo "========================================="
echo ""

# Stop existing Grafana container if running
if docker ps -a | grep -q nexus-grafana; then
  echo "🛑 Stopping existing Grafana container..."
  docker stop nexus-grafana >/dev/null 2>&1 || true
  docker rm nexus-grafana >/dev/null 2>&1 || true
fi

# Run Grafana container
echo "🚀 Starting Grafana container..."
docker run -d \
  --name nexus-grafana \
  --restart unless-stopped \
  -p "$GRAFANA_PORT:3000" \
  -e "GF_SECURITY_ADMIN_USER=$GRAFANA_ADMIN_USER" \
  -e "GF_SECURITY_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD" \
  -e "GF_USERS_ALLOW_SIGN_UP=false" \
  -e "GF_SERVER_ROOT_URL=http://localhost:$GRAFANA_PORT" \
  -e "GF_INSTALL_PLUGINS=grafana-piechart-panel" \
  -e "SUPABASE_DB_HOST=$SUPABASE_DB_HOST" \
  -e "SUPABASE_DB_PORT=$SUPABASE_DB_PORT" \
  -e "SUPABASE_DB_USER=$SUPABASE_DB_USER" \
  -e "SUPABASE_DB_PASSWORD=$SUPABASE_DB_PASSWORD" \
  -e "SUPABASE_DB_READONLY_USER=$SUPABASE_DB_READONLY_USER" \
  -e "SUPABASE_DB_READONLY_PASSWORD=$SUPABASE_DB_READONLY_PASSWORD" \
  -v "$GRAFANA_DATA_DIR:/var/lib/grafana" \
  -v "$GRAFANA_DIR/provisioning:/etc/grafana/provisioning" \
  -v "$GRAFANA_DIR/dashboards:/etc/grafana/dashboards" \
  grafana/grafana:latest

echo ""
echo "⏳ Waiting for Grafana to start..."
sleep 10

# Wait for Grafana API to be ready
MAX_RETRIES=30
RETRY_COUNT=0
until curl -sf "http://localhost:$GRAFANA_PORT/api/health" >/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Grafana failed to start after $MAX_RETRIES attempts"
    docker logs nexus-grafana
    exit 1
  fi
  echo "  Retry $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2
done

echo ""
echo "========================================="
echo "✅ Grafana Setup Complete!"
echo "========================================="
echo ""
echo "📊 Grafana URL: http://localhost:$GRAFANA_PORT"
echo "👤 Username: $GRAFANA_ADMIN_USER"
echo "🔑 Password: $GRAFANA_ADMIN_PASSWORD"
echo ""
echo "📋 Available Dashboards:"
echo "  • Per-Org Brain Health (uid: nexus-brain-health)"
echo "  • Core Admin Global View (uid: nexus-admin-global)"
echo ""
echo "💡 Tips:"
echo "  • Dashboards are auto-provisioned from grafana/dashboards/"
echo "  • Data source connects to Supabase PostgreSQL"
echo "  • To view logs: docker logs -f nexus-grafana"
echo "  • To restart: docker restart nexus-grafana"
echo "  • To stop: docker stop nexus-grafana"
echo ""
echo "🎯 Next Steps:"
echo "  1. Open Grafana in your browser"
echo "  2. Navigate to Dashboards → NexusBrain folder"
echo "  3. Select 'NexusBrain Per-Org Health' or 'Core Admin Global View'"
echo "  4. Customize dashboards as needed"
echo ""

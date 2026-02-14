#!/bin/bash
# Daily Security Scan — Auto-Run & Auto-Fix
# ═══════════════════════════════════════════════════════════════════════════
#
# This script runs daily as part of your agent runner
# Auto-fixes critical and high severity issues
# Sends alerts for manual review items
#
# Usage:
#   ./scripts/daily-security-scan.sh              # Full scan with auto-fix
#   ./scripts/daily-security-scan.sh --dry-run    # Scan only
#   ./scripts/daily-security-scan.sh --verbose    # Detailed output
#
# Cron Schedule (runs at 2 AM daily):
#   0 2 * * * cd /path/to/nexusbrain && ./scripts/daily-security-scan.sh
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             NEXUSBRAIN DAILY SECURITY SCAN — AUTO-FIX ENABLED             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check environment
if [ ! -f ".env" ]; then
  echo -e "${RED}❌ ERROR: .env file not found${NC}"
  echo "   Create .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

# Load environment
export $(cat .env | grep -v '^#' | xargs)

# Verify required vars
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}❌ ERROR: Missing required environment variables${NC}"
  echo "   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
  exit 1
fi

echo -e "${GREEN}✓ Environment loaded${NC}"
echo ""

# Run security scan
echo -e "${BLUE}🔍 Starting security scan...${NC}"
echo ""

if [ "$1" == "--dry-run" ]; then
  npm run security:scan:dry
elif [ "$1" == "--verbose" ]; then
  npm run security:scan:verbose
else
  npm run security:scan
fi

SCAN_EXIT_CODE=$?

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════${NC}"

if [ $SCAN_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ Security scan completed successfully${NC}"
  echo ""
  echo "Results:"
  echo "  • Scan report: SECURITY-SCAN-RESULTS.md"
  echo "  • Auto-fixes: Applied (if any critical/high issues found)"
  echo "  • Next scan: Tomorrow 2:00 AM UTC"
  echo ""
else
  echo -e "${RED}✗ Security scan completed with errors${NC}"
  echo ""
  echo "Please review:"
  echo "  • Error log above"
  echo "  • Run: npm run security:scan:verbose"
  echo "  • Check GitHub Actions for automated runs"
  echo ""
  exit $SCAN_EXIT_CODE
fi

# Check for generated migrations
if [ -d "supabase/migrations" ]; then
  NEW_MIGRATIONS=$(find supabase/migrations -name "*security*.sql" -mtime -1 2>/dev/null | wc -l)
  if [ "$NEW_MIGRATIONS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Security migrations generated:${NC}"
    find supabase/migrations -name "*security*.sql" -mtime -1 -exec basename {} \;
    echo ""
    echo "Apply with: supabase db push"
  fi
fi

# Check for pending PRs
if command -v gh &> /dev/null; then
  PENDING_PRS=$(gh pr list --label "security" --json number,title 2>/dev/null | grep -c '"number"' || echo "0")
  if [ "$PENDING_PRS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $PENDING_PRS pending security PR(s) for review${NC}"
    echo "   View: gh pr list --label security"
    echo ""
  fi
fi

echo -e "${GREEN}✓ Daily security scan complete!${NC}"
echo ""

exit 0

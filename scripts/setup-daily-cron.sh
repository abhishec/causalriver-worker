#!/bin/bash
# Setup Daily Security Scan Cron Job
# ═══════════════════════════════════════════════════════════════════════════

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║           SETUP DAILY SECURITY SCAN — CRON JOB CONFIGURATION             ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if cron is available
if ! command -v crontab &> /dev/null; then
  echo "❌ ERROR: crontab command not found"
  echo "   Install cron or use GitHub Actions for scheduling"
  exit 1
fi

# Create cron job
CRON_JOB="0 2 * * * cd $PROJECT_ROOT && npm run security:daily >> $PROJECT_ROOT/logs/security-scan.log 2>&1"

echo "This will add the following cron job:"
echo ""
echo "  Schedule: Daily at 2:00 AM"
echo "  Command:  npm run security:daily"
echo "  Log:      $PROJECT_ROOT/logs/security-scan.log"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Add to crontab (avoid duplicates)
(crontab -l 2>/dev/null | grep -v "security:daily" ; echo "$CRON_JOB") | crontab -

echo ""
echo "✓ Cron job added successfully!"
echo ""
echo "Verify with: crontab -l"
echo "View logs:   tail -f $PROJECT_ROOT/logs/security-scan.log"
echo ""
echo "Note: GitHub Actions is recommended for production"
echo "      (Already configured in .github/workflows/security-scan.yml)"
echo ""

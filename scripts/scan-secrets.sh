#!/bin/bash

# Git History Secret Scanner
# ═══════════════════════════════════════════════════════════════════════════
#
# Scans entire git history for accidentally committed secrets
# Uses gitleaks to detect:
# - API keys
# - Passwords
# - Tokens
# - Private keys
# - AWS credentials
# - Database connection strings
#
# Usage: ./scripts/scan-secrets.sh
#

set -e

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║           GIT HISTORY SECRET SCANNER (GITLEAKS)                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if gitleaks is installed
if ! command -v gitleaks &> /dev/null; then
    echo "❌ gitleaks not found!"
    echo ""
    echo "Install gitleaks:"
    echo "  macOS:   brew install gitleaks"
    echo "  Linux:   https://github.com/gitleaks/gitleaks/releases"
    echo ""
    exit 1
fi

echo "✓ gitleaks installed"
echo ""

# Run gitleaks scan
echo "🔍 Scanning entire git history for secrets..."
echo ""

REPORT_FILE="gitleaks-report.json"
REPORT_READABLE="gitleaks-report.txt"

# Scan with gitleaks
if gitleaks detect --source . --verbose --report-path "$REPORT_FILE" --report-format json; then
    echo ""
    echo "✅ NO SECRETS FOUND IN GIT HISTORY!"
    echo ""
    echo "Your repository is clean. No sensitive data detected."
    rm -f "$REPORT_FILE" 2>/dev/null
    exit 0
else
    LEAK_COUNT=$(jq length "$REPORT_FILE" 2>/dev/null || echo "unknown")

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚨 CRITICAL: SECRETS DETECTED IN GIT HISTORY!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Found: $LEAK_COUNT potential secret(s)"
    echo ""

    # Generate human-readable report
    echo "Secrets Found:" > "$REPORT_READABLE"
    echo "═════════════" >> "$REPORT_READABLE"
    echo "" >> "$REPORT_READABLE"

    jq -r '.[] | "File: \(.File)\nCommit: \(.Commit)\nSecret: \(.Secret | .[0:50])...\nRule: \(.RuleID)\n---"' "$REPORT_FILE" >> "$REPORT_READABLE" 2>/dev/null || true

    echo "Detailed report saved to:"
    echo "  - $REPORT_FILE (JSON)"
    echo "  - $REPORT_READABLE (human-readable)"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "IMMEDIATE ACTIONS REQUIRED:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. ROTATE ALL EXPOSED SECRETS IMMEDIATELY"
    echo "   - Supabase: Rotate service role key"
    echo "   - AWS: Rotate access keys"
    echo "   - GitHub: Regenerate tokens"
    echo "   - Database: Change passwords"
    echo ""
    echo "2. CLEAN GIT HISTORY (removes secrets from ALL commits)"
    echo "   ⚠️  WARNING: This rewrites git history!"
    echo ""
    echo "   For each secret file found, run:"
    echo "   git filter-branch --force --index-filter \\"
    echo "     'git rm --cached --ignore-unmatch path/to/secret/file' \\"
    echo "     --prune-empty --tag-name-filter cat -- --all"
    echo ""
    echo "   Then force push:"
    echo "   git push origin --force --all"
    echo ""
    echo "3. PREVENT FUTURE LEAKS"
    echo "   - Add pre-commit hook: https://github.com/gitleaks/gitleaks#pre-commit"
    echo "   - Use .gitignore for sensitive files"
    echo "   - Enable GitHub secret scanning"
    echo ""
    echo "4. NOTIFY YOUR TEAM"
    echo "   All team members must:"
    echo "   - git fetch --all"
    echo "   - git reset --hard origin/main"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    exit 1
fi

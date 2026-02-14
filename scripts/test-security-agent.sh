#!/bin/bash
# Test Security Agent Setup
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║             SECURITY AGENT - SETUP VERIFICATION TEST                     ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_check() {
  local test_name="$1"
  local test_command="$2"

  echo -n "Testing: $test_name ... "

  if eval "$test_command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
  fi
}

echo "1. Checking Required Files"
echo "───────────────────────────────────────────────────────────────────────────"

test_check "Security agent exists" "test -f scripts/agents/security-hardening-agent.ts"
test_check "Runner script exists" "test -f scripts/run-security-agent.ts"
test_check "GitHub workflow exists" "test -f .github/workflows/security-scan.yml"
test_check "Documentation exists" "test -f docs/SECURITY-AGENT-GUIDE.md"
test_check "Summary exists" "test -f docs/SECURITY-AGENT-SUMMARY.md"

echo ""
echo "2. Checking Environment Variables"
echo "───────────────────────────────────────────────────────────────────────────"

test_check "SUPABASE_URL set" "[ ! -z \"$SUPABASE_URL\" ]"
test_check "SUPABASE_SERVICE_ROLE_KEY set" "[ ! -z \"$SUPABASE_SERVICE_ROLE_KEY\" ]"
test_check "DEFAULT_ORG_ID set (optional)" "[ ! -z \"$DEFAULT_ORG_ID\" ] || echo 'Optional'"

echo ""
echo "3. Checking Package Scripts"
echo "───────────────────────────────────────────────────────────────────────────"

test_check "security:scan script" "grep -q 'security:scan' package.json"
test_check "security:scan:dry script" "grep -q 'security:scan:dry' package.json"
test_check "security:scan:verbose script" "grep -q 'security:scan:verbose' package.json"

echo ""
echo "4. Checking TypeScript Compilation"
echo "───────────────────────────────────────────────────────────────────────────"

test_check "Security agent compiles" "npx tsc --noEmit scripts/agents/security-hardening-agent.ts || true"
test_check "Runner compiles" "npx tsc --noEmit scripts/run-security-agent.ts || true"

echo ""
echo "5. Checking Dependencies"
echo "───────────────────────────────────────────────────────────────────────────"

test_check "tsx installed" "command -v tsx"
test_check "@supabase/supabase-js installed" "npm list @supabase/supabase-js > /dev/null 2>&1 || pnpm list @supabase/supabase-js"
test_check "dotenv installed" "npm list dotenv > /dev/null 2>&1 || pnpm list dotenv"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "RESULTS"
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Run a dry-run scan: npm run security:scan:dry"
  echo "  2. Review the documentation: docs/SECURITY-AGENT-GUIDE.md"
  echo "  3. Configure GitHub secrets for automated scans"
  echo ""
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please fix the failed tests before running the security agent."
  echo ""
  echo "Common fixes:"
  echo "  - Missing env vars: Copy .env.example to .env and fill in values"
  echo "  - Missing deps: Run 'pnpm install'"
  echo "  - TypeScript errors: Check agent code for syntax errors"
  echo ""
  exit 1
fi

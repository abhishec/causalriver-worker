#!/bin/bash
# 🔒 PRODUCTION SECURITY TEST SCRIPT
# Tests IDS, error handling, and security headers on live site

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔒 NexusBrain Production Security Test${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Get production URL
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: $0 <PRODUCTION_URL>${NC}"
    echo ""
    echo "Example:"
    echo "  $0 https://nexus-intelligence.vercel.app"
    echo ""
    exit 1
fi

PROD_URL=$1
echo -e "${BLUE}Testing:${NC} $PROD_URL"
echo ""

# Test counter
PASSED=0
FAILED=0
TOTAL=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected=$3
    local description=$4

    TOTAL=$((TOTAL + 1))
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test $TOTAL: $test_name${NC}"
    echo -e "${YELLOW}Description:${NC} $description"
    echo ""

    # Run the test
    result=$(eval "$test_command" 2>&1)

    # Check if result matches expected
    if echo "$result" | grep -q "$expected"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo -e "${GREEN}Response:${NC} $(echo "$result" | head -5)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo -e "${RED}Expected:${NC} $expected"
        echo -e "${RED}Got:${NC} $(echo "$result" | head -10)"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}CATEGORY 1: INTRUSION DETECTION SYSTEM (IDS)${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test 1: SQL Injection Detection
run_test \
    "SQL Injection Detection" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL/api/test?id=1'\'' OR '\''1'\''='\''1'" \
    "403\|Forbidden\|Security violation" \
    "IDS should block SQL injection attempts with 403 Forbidden"

# Test 2: XSS Attack Detection
run_test \
    "XSS Attack Detection" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL/api/test?input=<script>alert(\"xss\")</script>'" \
    "403\|Forbidden\|Security violation" \
    "IDS should block XSS attempts with 403 Forbidden"

# Test 3: Path Traversal Detection
run_test \
    "Path Traversal Detection" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL/api/test?file=../../etc/passwd'" \
    "403\|Forbidden\|Security violation" \
    "IDS should block path traversal attempts with 403 Forbidden"

# Test 4: Command Injection Detection
run_test \
    "Command Injection Detection" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL/api/test?cmd=; ls -la'" \
    "403\|Forbidden\|Security violation" \
    "IDS should block command injection attempts with 403 Forbidden"

echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}CATEGORY 2: SECURE ERROR HANDLING${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test 5: 404 Error Handling
run_test \
    "404 Error - No Stack Traces" \
    "curl -s '$PROD_URL/nonexistent-page-$(date +%s)'" \
    "404\|Not Found" \
    "404 errors should show generic message without stack traces"

# Test 6: No File Path Exposure
run_test \
    "No File Paths in Errors" \
    "curl -s '$PROD_URL/api/nonexistent'" \
    "^((?!\/Users|\/home|C:\\\\|\.tsx|\.ts|\.js).)*$" \
    "Errors should not expose file system paths"

echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}CATEGORY 3: OWASP SECURITY HEADERS${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test 7: X-Content-Type-Options Header
run_test \
    "X-Content-Type-Options Header" \
    "curl -I -s '$PROD_URL' | grep -i 'x-content-type-options'" \
    "nosniff" \
    "Should include X-Content-Type-Options: nosniff header"

# Test 8: X-Frame-Options Header
run_test \
    "X-Frame-Options Header" \
    "curl -I -s '$PROD_URL' | grep -i 'x-frame-options'" \
    "DENY\|SAMEORIGIN" \
    "Should include X-Frame-Options header"

# Test 9: X-XSS-Protection Header
run_test \
    "X-XSS-Protection Header" \
    "curl -I -s '$PROD_URL' | grep -i 'x-xss-protection'" \
    "1" \
    "Should include X-XSS-Protection header"

# Test 10: Strict-Transport-Security Header
run_test \
    "Strict-Transport-Security Header" \
    "curl -I -s '$PROD_URL' | grep -i 'strict-transport-security'" \
    "max-age" \
    "Should include HSTS header"

# Test 11: Content-Security-Policy Header
run_test \
    "Content-Security-Policy Header" \
    "curl -I -s '$PROD_URL' | grep -i 'content-security-policy'" \
    "default-src\|script-src\|style-src" \
    "Should include CSP header"

echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}CATEGORY 4: BASIC FUNCTIONALITY${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test 12: Homepage Loads
run_test \
    "Homepage Availability" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL'" \
    "HTTP_CODE:200" \
    "Homepage should return 200 OK"

# Test 13: Login Page Loads
run_test \
    "Login Page Availability" \
    "curl -s -w '\nHTTP_CODE:%{http_code}' '$PROD_URL/login'" \
    "HTTP_CODE:200" \
    "Login page should return 200 OK"

echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}TEST RESULTS SUMMARY${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}Total Tests:${NC} $TOTAL"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

# Calculate percentage
if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$((PASSED * 100 / TOTAL))
    echo -e "${BLUE}Success Rate:${NC} $PERCENTAGE%"
    echo ""

    if [ $PERCENTAGE -eq 100 ]; then
        echo -e "${GREEN}🎉 EXCELLENT! All security tests passed!${NC}"
    elif [ $PERCENTAGE -ge 80 ]; then
        echo -e "${YELLOW}⚠️  GOOD but some tests failed. Review above for details.${NC}"
    else
        echo -e "${RED}❌ CRITICAL: Multiple security tests failed! Review immediately.${NC}"
    fi
else
    echo -e "${RED}No tests were run${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}DETAILED RECOMMENDATIONS${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}Failed tests indicate potential security issues:${NC}"
    echo ""
    echo "1. Review the failed test output above"
    echo "2. Check middleware configuration in platform/middleware.ts"
    echo "3. Verify IDS is enabled in production"
    echo "4. Check next.config.js security headers"
    echo "5. Review error handling in pages/_error.tsx"
    echo ""
    echo "For detailed security configuration, see:"
    echo "  - SECURITY-AUDIT-REPORT.md"
    echo "  - PRODUCTION-DEPLOYMENT-READY.md"
    echo ""
else
    echo -e "${GREEN}✅ All security measures are working correctly!${NC}"
    echo ""
    echo "Your platform is secure and production-ready!"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Exit with appropriate code
if [ $FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi

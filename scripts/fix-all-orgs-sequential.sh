#!/bin/bash

# Fix All Organizations Sequentially
# Ensures all orgs are HEALTHY with full brain connectivity

echo "════════════════════════════════════════════════════════════════"
echo "  🔧 FIXING ALL ORGANIZATIONS (Sequential)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Organization IDs
ORGS=(
  "22222222-2222-4000-a000-222222222222:Company Jarvis"
  "7e6b13a9-2a5b-4f65-95a3-0a1eed6e3387:Developer Jarvis"
  "d3d8865a-4cd4-4b6c-8783-524af2625256:Tookitaki"
  "0726beca-cc31-453d-a57f-19c20db9a7f2:Monetize"
)

SUCCESS=0
FAILED=0

for entry in "${ORGS[@]}"; do
  IFS=':' read -r ORG_ID ORG_NAME <<< "$entry"

  echo ""
  echo "──────────────────────────────────────────────────────────────"
  echo "  Fixing: $ORG_NAME"
  echo "  ID: $ORG_ID"
  echo "──────────────────────────────────────────────────────────────"
  echo ""

  # Run fix with full output
  npx tsx scripts/run-org-agent.ts fix \
    --org-id "$ORG_ID" \
    --reinit-brain \
    --recalibrate \
    --full-audit 2>&1 | tee "/tmp/fix-$ORG_NAME.log"

  # Check result
  if grep -q "Health: HEALTHY" "/tmp/fix-$ORG_NAME.log"; then
    echo ""
    echo "✅ $ORG_NAME: HEALTHY"
    ((SUCCESS++))
  else
    echo ""
    echo "❌ $ORG_NAME: FAILED"
    ((FAILED++))
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  📊 FINAL RESULTS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Total Organizations: ${#ORGS[@]}"
echo "  ✅ Healthy: $SUCCESS"
echo "  ❌ Failed: $FAILED"
echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "🎉 ALL ORGANIZATIONS ARE HEALTHY!"
  echo ""
  exit 0
else
  echo ""
  echo "⚠️  Some organizations need attention"
  echo ""
  exit 1
fi

#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "  🔧 FINAL FIX FOR ALL 6 ORGANIZATIONS"
echo "════════════════════════════════════════════════════════════════"
echo ""

# All org IDs (excluding Core Brain)
declare -A ORGS
ORGS["Company Jarvis"]="22222222-2222-4000-a000-222222222222"
ORGS["Developer Jarvis"]="7e6b13a9-2a5b-4f65-95a3-0a1eed6e3387"
ORGS["Slack Jarvis"]="35beca6c-b8cc-4bc1-a578-ae6856b1f735"
ORGS["Finance Jarvis"]="7a96ce5b-a30e-4277-a6d8-60ce8291c555"
ORGS["Tookitaki"]="d3d8865a-4cd4-4b6c-8783-524af2625256"
ORGS["Monetize"]="0726beca-cc31-453d-a57f-19c20db9a7f2"

HEALTHY=0
DEGRADED=0
CRITICAL=0

for ORG_NAME in "${!ORGS[@]}"; do
  ORG_ID="${ORGS[$ORG_NAME]}"

  echo "──────────────────────────────────────────────────────────────"
  echo "  Fixing: $ORG_NAME"
  echo "──────────────────────────────────────────────────────────────"

  # Run fix and capture output
  OUTPUT=$(npx tsx scripts/run-org-agent.ts fix \
    --org-id "$ORG_ID" \
    --reinit-brain \
    --recalibrate \
    --full-audit 2>&1)

  # Check health
  if echo "$OUTPUT" | grep -q "Health: HEALTHY"; then
    echo "✅ $ORG_NAME: HEALTHY"
    ((HEALTHY++))
  elif echo "$OUTPUT" | grep -q "Health: DEGRADED"; then
    echo "⚠️  $ORG_NAME: DEGRADED"
    ((DEGRADED++))
  else
    echo "❌ $ORG_NAME: CRITICAL"
    ((CRITICAL++))
  fi

  echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "  📊 FINAL RESULTS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Total Organizations: ${#ORGS[@]}"
echo "  ✅ HEALTHY: $HEALTHY"
echo "  ⚠️  DEGRADED: $DEGRADED"
echo "  ❌ CRITICAL: $CRITICAL"
echo ""

if [ $HEALTHY -eq ${#ORGS[@]} ]; then
  echo "🎉 ALL ORGANIZATIONS ARE HEALTHY!"
else
  echo "⚠️  Some organizations need attention"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"

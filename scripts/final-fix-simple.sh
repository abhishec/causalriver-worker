#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "  🔧 FINAL FIX FOR ALL 6 JARVIS ORGANIZATIONS"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Organization list: NAME:ID
ORGS=(
  "Company-Jarvis:22222222-2222-4000-a000-222222222222"
  "Developer-Jarvis:7e6b13a9-2a5b-4f65-95a3-0a1eed6e3387"
  "Slack-Jarvis:35beca6c-b8cc-4bc1-a578-ae6856b1f735"
  "Finance-Jarvis:7a96ce5b-a30e-4277-a6d8-60ce8291c555"
  "Tookitaki:d3d8865a-4cd4-4b6c-8783-524af2625256"
  "Monetize:0726beca-cc31-453d-a57f-19c20db9a7f2"
)

HEALTHY=0
DEGRADED=0
CRITICAL=0

for entry in "${ORGS[@]}"; do
  IFS=':' read -r NAME ID <<< "$entry"

  echo "──────────────────────────────────────────────────────────────"
  echo "  Fixing: $NAME"
  echo "──────────────────────────────────────────────────────────────"

  # Run fix
  OUTPUT=$(npx tsx scripts/run-org-agent.ts fix \
    --org-id "$ID" \
    --reinit-brain \
    --recalibrate \
    --full-audit 2>&1)

  # Check health
  if echo "$OUTPUT" | grep -q "Health: HEALTHY"; then
    echo "✅ $NAME: HEALTHY"
    ((HEALTHY++))
  elif echo "$OUTPUT" | grep -q "Health: DEGRADED"; then
    echo "⚠️  $NAME: DEGRADED"
    ((DEGRADED++))
  else
    echo "❌ $NAME: CRITICAL"
    ((CRITICAL++))
  fi

  echo ""
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  📊 FINAL RESULTS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Total: 6 organizations"
echo "  ✅ HEALTHY: $HEALTHY"
echo "  ⚠️  DEGRADED: $DEGRADED"
echo "  ❌ CRITICAL: $CRITICAL"
echo ""

if [ $HEALTHY -eq 6 ]; then
  echo "🎉 ALL 6 JARVIS ORGANIZATIONS ARE HEALTHY!"
  echo ""
  exit 0
fi

echo "════════════════════════════════════════════════════════════════"

#!/bin/sh
set -e

echo "========================================"
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] NexusBrain Brain Training"
echo "Process: ${BRAIN_PROCESS:-trainer}"
echo "========================================"

case "${BRAIN_PROCESS}" in
  trainer)
    echo "Starting Autonomous Trainer (one-shot)..."
    exec pnpm exec tsx scripts/autonomous-trainer.ts
    ;;
  consolidation)
    echo "Starting Brain Consolidation (one-shot)..."
    export CONSOLIDATION_MODE=once
    exec pnpm exec tsx scripts/brain-consolidation-runner.ts
    ;;
  dmn)
    echo "Starting DMN Scan (one-shot)..."
    export DMN_MODE=once
    exec pnpm exec tsx scripts/brain-dmn-runner.ts
    ;;
  *)
    echo "ERROR: Unknown BRAIN_PROCESS '${BRAIN_PROCESS}'"
    echo "Valid values: trainer, consolidation, dmn"
    exit 1
    ;;
esac

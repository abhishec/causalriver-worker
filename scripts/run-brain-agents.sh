#!/bin/bash
# NexusBrain Brain Agents — Runner Script
# Orchestrates all brain agents: Consolidation (sleep), DMN (insights), Trainer
# Used by launchd to run on a schedule.
#
# Usage:
#   ./scripts/run-brain-agents.sh consolidation   # Run brain sleep
#   ./scripts/run-brain-agents.sh dmn              # Run DMN scan
#   ./scripts/run-brain-agents.sh trainer          # Run autonomous trainer
#   ./scripts/run-brain-agents.sh all              # Run all (trainer → consolidation → dmn)

set -euo pipefail

# Project directory
PROJECT_DIR="/Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My Drive/Workspace - Monetize Organisation/02 - Product/NexusBrain"

# Ensure PATH includes homebrew + node
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR"

# Log directory
LOG_DIR="$HOME/Library/Logs"
mkdir -p "$LOG_DIR"

# Agent to run
AGENT="${1:-all}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

run_consolidation() {
  local LOG_FILE="$LOG_DIR/nexusbrain-consolidation.log"
  log "Starting Brain Consolidation (Sleep)..." | tee -a "$LOG_FILE"
  echo "────────────────────────────────────────" >> "$LOG_FILE"

  VERBOSE=true \
  CONSOLIDATE_ALL_ORGS=true \
  pnpm exec tsx scripts/brain-consolidation-runner.ts >> "$LOG_FILE" 2>&1

  log "Consolidation complete." | tee -a "$LOG_FILE"
  echo "" >> "$LOG_FILE"
}

run_dmn() {
  local LOG_FILE="$LOG_DIR/nexusbrain-dmn.log"
  log "Starting DMN Scan (Background Insights)..." | tee -a "$LOG_FILE"
  echo "────────────────────────────────────────" >> "$LOG_FILE"

  VERBOSE=true \
  SCAN_ALL_ORGS=true \
  pnpm exec tsx scripts/brain-dmn-runner.ts >> "$LOG_FILE" 2>&1

  log "DMN scan complete." | tee -a "$LOG_FILE"
  echo "" >> "$LOG_FILE"
}

run_trainer() {
  local LOG_FILE="$LOG_DIR/nexusbrain-trainer.log"
  log "Starting Autonomous Trainer..." | tee -a "$LOG_FILE"
  echo "────────────────────────────────────────" >> "$LOG_FILE"

  pnpm exec tsx scripts/autonomous-trainer.ts >> "$LOG_FILE" 2>&1

  log "Trainer complete." | tee -a "$LOG_FILE"
  echo "" >> "$LOG_FILE"
}

case "$AGENT" in
  consolidation|sleep)
    run_consolidation
    ;;
  dmn|insights)
    run_dmn
    ;;
  trainer|train)
    run_trainer
    ;;
  all|full)
    log "Running full brain cycle: Trainer → Consolidation → DMN"
    run_trainer
    run_consolidation
    run_dmn
    log "Full brain cycle complete."
    ;;
  *)
    echo "Usage: $0 {consolidation|dmn|trainer|all}"
    echo ""
    echo "Agents:"
    echo "  consolidation  Brain Sleep — nightly deep consolidation"
    echo "  dmn            Default Mode Network — background insight scanning"
    echo "  trainer        Autonomous Trainer — 5-stage training pipeline"
    echo "  all            Run all agents in sequence"
    exit 1
    ;;
esac

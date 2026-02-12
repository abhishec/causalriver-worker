#!/bin/bash
# ============================================================
# NexusBrain Agent Runner — LOCAL WRAPPER
# ============================================================
# This script lives in ~/bin/ (NOT Google Drive) so that macOS
# launchd can execute it without "Operation not permitted" errors.
#
# macOS sandboxes launchd processes from accessing Google Drive
# CloudStorage paths directly. This wrapper:
#   1. Sets CWD to /tmp first (avoids Node.js uv_cwd crash)
#   2. Uses absolute paths for everything
#   3. Calls tsx directly (not via pnpm exec, which also calls cwd())
#
# Usage:
#   ~/bin/nexusbrain-runner.sh consolidation
#   ~/bin/nexusbrain-runner.sh dmn
#   ~/bin/nexusbrain-runner.sh trainer
#   ~/bin/nexusbrain-runner.sh all
# ============================================================

# CRITICAL: Set CWD to a safe location IMMEDIATELY
# Node.js/pnpm crash with EPERM if CWD is in Google Drive
cd /tmp

# Project directory (LOCAL clone — NOT Google Drive)
# Google Drive paths are sandboxed by macOS TCC and fail with EPERM from launchd
PROJECT_DIR="/Users/abhishek/Projects/NexusBrain"

# tsx binary lives in the project's node_modules
TSX="${PROJECT_DIR}/node_modules/.bin/tsx"
NODE="/opt/homebrew/bin/node"

# Ensure PATH includes homebrew, node
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/abhishek"

# Node needs to resolve modules from the project directory
export NODE_PATH="${PROJECT_DIR}/node_modules"

# Log directory
LOG_DIR="$HOME/Library/Logs"
mkdir -p "$LOG_DIR"

# Agent to run
AGENT="${1:-all}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [nexusbrain] $1"
}

log_to_file() {
  local file="$1"
  shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$file"
}

# Run tsx — since PROJECT_DIR is now local (not Google Drive), we can cd into it safely
run_tsx() {
  local script="$1"
  shift
  cd "$PROJECT_DIR" || { log "ERROR: Cannot cd to $PROJECT_DIR"; return 1; }
  /opt/homebrew/bin/pnpm exec tsx "scripts/${script}" "$@"
}

run_consolidation() {
  local LOG_FILE="$LOG_DIR/nexusbrain-consolidation.log"
  log "Starting Brain Consolidation (Sleep)..."
  log_to_file "$LOG_FILE" "════════════════════ NEW RUN ════════════════════"

  VERBOSE=true \
  CONSOLIDATE_ALL_ORGS=true \
  run_tsx brain-consolidation-runner.ts >> "$LOG_FILE" 2>&1

  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    log "Consolidation complete."
    log_to_file "$LOG_FILE" "Consolidation completed successfully"
  else
    log "Consolidation failed with exit code $exit_code"
    log_to_file "$LOG_FILE" "Consolidation FAILED with exit code $exit_code"
  fi
}

run_dmn() {
  local LOG_FILE="$LOG_DIR/nexusbrain-dmn.log"
  log "Starting DMN Scan (Background Insights)..."
  log_to_file "$LOG_FILE" "════════════════════ NEW RUN ════════════════════"

  VERBOSE=true \
  SCAN_ALL_ORGS=true \
  run_tsx brain-dmn-runner.ts >> "$LOG_FILE" 2>&1

  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    log "DMN scan complete."
    log_to_file "$LOG_FILE" "DMN scan completed successfully"
  else
    log "DMN scan failed with exit code $exit_code"
    log_to_file "$LOG_FILE" "DMN scan FAILED with exit code $exit_code"
  fi
}

run_trainer() {
  local LOG_FILE="$LOG_DIR/nexusbrain-trainer.log"
  log "Starting Autonomous Trainer..."
  log_to_file "$LOG_FILE" "════════════════════ NEW RUN ════════════════════"

  run_tsx autonomous-trainer.ts >> "$LOG_FILE" 2>&1

  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    log "Trainer complete."
    log_to_file "$LOG_FILE" "Trainer completed successfully"
  else
    log "Trainer failed with exit code $exit_code"
    log_to_file "$LOG_FILE" "Trainer FAILED with exit code $exit_code"
  fi
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

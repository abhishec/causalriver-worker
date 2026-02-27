#!/bin/bash
# BrainOS Build Guardian
# Runs TypeScript check in a loop. Auto-fixes on failure.
# Usage: ./platform/scripts/build-guardian.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="$REPO_ROOT/platform"
LOG_FILE="$REPO_ROOT/.claude/build-guardian.log"
CYCLE=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "Build Guardian starting. Repo: $REPO_ROOT"

while true; do
  CYCLE=$((CYCLE + 1))
  log "=== Cycle $CYCLE ==="

  # Pull latest
  cd "$REPO_ROOT"
  git pull --rebase origin main 2>/dev/null || log "Pull skipped (no remote changes)"

  # TypeScript check
  TSC_OUTPUT=$(npx tsc --noEmit -p "$PLATFORM/tsconfig.json" 2>&1 || true)
  TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -c "error TS" || true)

  if [ "$TSC_ERRORS" -eq 0 ]; then
    log "TypeScript clean (0 errors). Sleeping 5min..."
    sleep 300
    continue
  fi

  log "$TSC_ERRORS TypeScript error(s) found. Starting auto-fix..."
  log "$TSC_OUTPUT"

  # Extract error files
  ERROR_FILES=$(echo "$TSC_OUTPUT" | grep "error TS" | sed 's/(.*//' | sort -u | head -10)
  log "Files with errors: $ERROR_FILES"

  # Run Claude to fix
  FIX_PROMPT="Fix these TypeScript errors in the BrainOS codebase. DO NOT QUEUE. Fix directly.

Errors:
$TSC_OUTPUT

Rules:
- Only fix the TypeScript errors shown above
- Do not refactor, rename, or change logic
- After fixing, run: npx tsc --noEmit -p $PLATFORM/tsconfig.json
- Must reach 0 errors
- Then: git add <fixed files> && git commit -m 'fix(build): resolve TypeScript errors [build-guardian]' && git pull --rebase origin main && git push origin main"

  echo "$FIX_PROMPT" | claude --print --output-format text 2>>"$LOG_FILE" || log "Claude fix attempt failed"

  # Verify after fix
  TSC_AFTER=$(npx tsc --noEmit -p "$PLATFORM/tsconfig.json" 2>&1 || true)
  ERRORS_AFTER=$(echo "$TSC_AFTER" | grep -c "error TS" || true)

  if [ "$ERRORS_AFTER" -eq 0 ]; then
    log "Fixed! TypeScript clean. Sleeping 5min..."
    sleep 300
  else
    log "Still $ERRORS_AFTER errors after fix attempt. Will retry in 2min..."
    sleep 120
  fi
done

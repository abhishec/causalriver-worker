#!/bin/bash
# NexusBrain Brain Agents — launchd Setup
#
# Installs (or uninstalls) the brain agents as macOS launchd services.
# These agents run autonomously on your laptop:
#
#   1. Trainer        (1 AM daily)          — 5-stage autonomous training pipeline
#   2. Consolidation  (2 AM daily)          — Brain sleep / deep consolidation + ML learning
#   3. DMN            (every 4 hours)       — Background insight scanning + anomaly detection
#   4. Weekly         (Sunday 4 AM)         — Benchmark suite + brain health + edge pruning
#   5. Monthly        (1st of month 3 AM)   — Full historical causal discovery + growth report
#
# Usage:
#   ./launchd/setup-agents.sh install     # Install all agents
#   ./launchd/setup-agents.sh uninstall   # Stop and uninstall all agents
#   ./launchd/setup-agents.sh status      # Check agent status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

AGENTS=(
  "com.nexusbrain.trainer"
  "com.nexusbrain.consolidation"
  "com.nexusbrain.dmn"
  "com.nexusbrain.weekly"
  "com.nexusbrain.monthly"
)

install_agents() {
  echo "Installing NexusBrain brain agents..."
  echo ""

  mkdir -p "$LAUNCH_AGENTS_DIR"

  for agent in "${AGENTS[@]}"; do
    local plist="$SCRIPT_DIR/${agent}.plist"
    local dest="$LAUNCH_AGENTS_DIR/${agent}.plist"

    if [ ! -f "$plist" ]; then
      echo "  ✗ Missing plist: $plist"
      continue
    fi

    # Unload if already loaded
    launchctl unload "$dest" 2>/dev/null || true

    # Copy and load
    cp "$plist" "$dest"
    launchctl load "$dest"
    echo "  ✓ Installed: $agent"
  done

  echo ""
  echo "All brain agents installed. Schedule:"
  echo "  • Trainer:        Daily at 1:00 AM"
  echo "  • Consolidation:  Daily at 2:00 AM"
  echo "  • DMN:            Every 4 hours"
  echo "  • Weekly:         Sunday at 4:00 AM"
  echo "  • Monthly:        1st of month at 3:00 AM"
  echo ""
  echo "Logs: ~/Library/Logs/nexusbrain-*.log"
  echo ""
  echo "To run manually:"
  echo "  ./scripts/run-brain-agents.sh all"
}

uninstall_agents() {
  echo "Uninstalling NexusBrain brain agents..."
  echo ""

  for agent in "${AGENTS[@]}"; do
    local dest="$LAUNCH_AGENTS_DIR/${agent}.plist"

    if [ -f "$dest" ]; then
      launchctl unload "$dest" 2>/dev/null || true
      rm -f "$dest"
      echo "  ✓ Removed: $agent"
    else
      echo "  - Not installed: $agent"
    fi
  done

  echo ""
  echo "All brain agents uninstalled."
}

show_status() {
  echo "NexusBrain Brain Agent Status:"
  echo ""

  for agent in "${AGENTS[@]}"; do
    local dest="$LAUNCH_AGENTS_DIR/${agent}.plist"

    if [ -f "$dest" ]; then
      local status
      status=$(launchctl list | grep "$agent" || echo "")
      if [ -n "$status" ]; then
        echo "  ✓ $agent: LOADED"
        echo "    $status"
      else
        echo "  ⚠ $agent: INSTALLED but not loaded"
      fi
    else
      echo "  ✗ $agent: NOT INSTALLED"
    fi
  done

  echo ""
  echo "Recent log activity:"
  for logfile in "$HOME/Library/Logs/nexusbrain-"*.log; do
    if [ -f "$logfile" ]; then
      local basename
      basename=$(basename "$logfile")
      local lastline
      lastline=$(tail -1 "$logfile" 2>/dev/null || echo "(empty)")
      echo "  $basename: $lastline"
    fi
  done
}

case "${1:-status}" in
  install)
    install_agents
    ;;
  uninstall|remove)
    uninstall_agents
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {install|uninstall|status}"
    exit 1
    ;;
esac

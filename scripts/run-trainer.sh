#!/bin/bash
# NexusBrain Autonomous Trainer — Runner Script
# Used by launchd to run the trainer on a schedule.
# Logs output to ~/Library/Logs/nexusbrain-trainer.log

set -euo pipefail

# Project directory
PROJECT_DIR="/Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My Drive/Workspace - Monetize Organisation/02 - Product/NexusBrain"

# Ensure PATH includes homebrew
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR"

echo "========================================" >> ~/Library/Logs/nexusbrain-trainer.log
echo "[$(date)] Starting NexusBrain trainer..." >> ~/Library/Logs/nexusbrain-trainer.log
echo "========================================" >> ~/Library/Logs/nexusbrain-trainer.log

pnpm exec tsx scripts/autonomous-trainer.ts >> ~/Library/Logs/nexusbrain-trainer.log 2>&1

echo "[$(date)] Trainer run complete." >> ~/Library/Logs/nexusbrain-trainer.log
echo "" >> ~/Library/Logs/nexusbrain-trainer.log

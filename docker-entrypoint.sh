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
  benchmark)
    echo "Starting LongMemEval Benchmark..."
    echo "  Method: ${BENCHMARK_METHOD:-observational}"
    echo "  Variant: ${BENCHMARK_VARIANT:-s}"
    echo "  Max Workers: ${BENCHMARK_MAX_WORKERS:-10}"
    exec pnpm exec tsx scripts/brain-benchmark-runner.ts
    ;;
  git-trainer)
    echo "Starting Git Code Trainer Agent..."
    echo "  Dry Run: ${GIT_TRAINER_DRY_RUN:-false}"
    echo "  GitHub Token: ${GITHUB_TOKEN:+YES}${GITHUB_TOKEN:-NO}"
    exec pnpm exec tsx scripts/git-code-trainer-runner.ts
    ;;
  cost-agent)
    echo "Starting Cost Agent..."
    echo "  Mode: ${COST_AGENT_MODE:-once}"
    echo "  Lookback: ${COST_LOOKBACK_DAYS:-30} days"
    exec pnpm exec tsx scripts/cost-agent-runner.ts
    ;;
  *)
    echo "ERROR: Unknown BRAIN_PROCESS '${BRAIN_PROCESS}'"
    echo "Valid values: trainer, consolidation, dmn, benchmark, git-trainer, cost-agent"
    exit 1
    ;;
esac

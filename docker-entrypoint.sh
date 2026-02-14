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
  benchmark-optimizer)
    echo "Starting Benchmark Optimizer Agent..."
    echo "  Mode: ${OPTIMIZER_MODE:-quick}"
    echo "  Sample: ${OPTIMIZER_SAMPLE:-50}"
    cd scripts/benchmarks/longmemeval
    exec python3 benchmark_optimizer.py "${OPTIMIZER_MODE:-quick}" --sample "${OPTIMIZER_SAMPLE:-50}"
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
  orchestrator)
    echo "Starting Brain Orchestrator (Central Nervous System)..."
    echo "  Mode: ${ORCHESTRATOR_MODE:-continuous}"
    exec pnpm exec tsx scripts/brain-orchestrator.ts
    ;;
  weekly)
    echo "Starting Weekly Brain Scan (11-region scan + benchmarks + pruning)..."
    exec pnpm exec tsx scripts/brain-weekly-runner.ts
    ;;
  monthly)
    echo "Starting Monthly Deep Analysis (full historical causal discovery)..."
    exec pnpm exec tsx scripts/brain-monthly-runner.ts
    ;;
  federation)
    echo "Starting Federation Agent (Core ↔ Org brain knowledge flow)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent federation-agent
    ;;
  security)
    echo "Starting Security Hardening Agent (vulnerability scanning + auto-patching)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent security-hardening-agent
    ;;
  *)
    echo "ERROR: Unknown BRAIN_PROCESS '${BRAIN_PROCESS}'"
    echo "Valid values: trainer, consolidation, dmn, benchmark, benchmark-optimizer, git-trainer, cost-agent, orchestrator, weekly, monthly, federation, security"
    exit 1
    ;;
esac

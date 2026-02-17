#!/bin/sh
set -e

# Default to orchestrator if no BRAIN_PROCESS specified
BRAIN_PROCESS="${BRAIN_PROCESS:-orchestrator}"

echo "========================================"
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] NexusBrain Brain Training"
echo "Process: ${BRAIN_PROCESS}"
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
  jira-trainer)
    echo "Starting JIRA Trainer Agent (Apache JIRA)..."
    echo "  Dry Run: ${JIRA_TRAINER_DRY_RUN:-false}"
    echo "  Mode: ${JIRA_TRAINER_MODE:-incremental}"
    echo "  Source: issues.apache.org (public, no auth)"
    exec pnpm exec tsx scripts/jira-trainer-runner.ts
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
    echo "Starting Federation Agent (Core <> Org brain knowledge flow)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent federation-agent
    ;;
  security)
    echo "Starting Security Hardening Agent (vulnerability scanning + auto-patching)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent security-hardening-agent
    ;;
  proactive-intelligence)
    echo "Starting Proactive Intelligence Agent (threshold breaches + trend detection)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent proactive-intelligence
    ;;
  org-updater)
    echo "Starting Org Updater Agent (connector sync + learning trigger)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent org-updater
    ;;
  outcome-resolver)
    echo "Starting Outcome Resolver Agent (prediction calibration loop)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent outcome-resolver
    ;;
  ci-healer)
    echo "Starting CI Healer Agent (GitHub Actions failure diagnosis + auto-fix)..."
    exec pnpm exec tsx scripts/brain-orchestrator.ts --agent ci-healer
    ;;
  *)
    echo "ERROR: Unknown BRAIN_PROCESS '${BRAIN_PROCESS}'"
    echo ""
    echo "Valid values:"
    echo "  orchestrator          Central nervous system (default, long-running)"
    echo "  trainer               Autonomous data learning (one-shot)"
    echo "  consolidation         Memory consolidation / sleep cycle (one-shot)"
    echo "  dmn                   Default Mode Network scanning (one-shot)"
    echo "  benchmark             LongMemEval benchmark suite (one-shot)"
    echo "  benchmark-optimizer   Python benchmark tuning (one-shot)"
    echo "  git-trainer           GitHub engineering patterns (one-shot)"
    echo "  jira-trainer          Apache JIRA PM patterns (one-shot)"
    echo "  cost-agent            Cost monitoring & anomaly detection (one-shot)"
    echo "  weekly                11-region brain scan + pruning (one-shot)"
    echo "  monthly               Full historical causal discovery (one-shot)"
    echo "  federation            Core <> Org knowledge federation (one-shot)"
    echo "  security              Security vulnerability scanning (one-shot)"
    echo "  proactive-intelligence  Proactive alerting & threat detection (one-shot)"
    echo "  org-updater           Org heartbeat: connector sync + learning (one-shot)"
    echo "  outcome-resolver      Prediction calibration loop closure (one-shot)"
    echo "  ci-healer             GitHub Actions failure diagnosis + auto-fix (on-demand)"
    exit 1
    ;;
esac

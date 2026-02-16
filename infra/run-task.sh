#!/bin/bash
# Manually run a NexusBrain brain training task on ECS Fargate
#
# Usage:
#   ./infra/run-task.sh trainer        # Run autonomous trainer
#   ./infra/run-task.sh consolidation  # Run brain consolidation
#   ./infra/run-task.sh dmn            # Run DMN scan

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
CLUSTER_NAME="nexusbrain-training"

PROCESS="${1:-}"

if [ -z "${PROCESS}" ]; then
  echo "Usage: ./infra/run-task.sh <process>"
  echo ""
  echo "Available processes:"
  echo "  trainer          Autonomous Trainer (every 6h)"
  echo "  consolidation    Brain Consolidation (daily 2 AM)"
  echo "  dmn              DMN Scan (every 4h)"
  echo "  benchmark        LongMemEval Benchmark (Sunday 5 AM)"
  echo "  benchmark-optimizer  Benchmark Optimizer (Python)"
  echo "  git-trainer      Git Code Trainer (Sunday 2 AM)"
  echo "  cost-agent       Cost Agent (daily 3 AM)"
  echo "  weekly           Weekly Brain Scan (Sunday 4 AM)"
  echo "  monthly          Monthly Deep Analysis (1st of month)"
  echo "  federation       Federation Agent (every 6h)"
  echo "  security         Security Hardening (daily 4 AM)"
  echo "  proactive-intelligence  Proactive Intelligence (every 4h)"
  echo "  org-updater      Org Updater (every 4h)"
  echo "  outcome-resolver Outcome Resolver (daily 3:30 AM)"
  echo "  ci-healer        CI Healer (on-demand)"
  echo "  orchestrator     Brain Orchestrator (continuous)"
  exit 1
fi

case "${PROCESS}" in
  trainer)              TASK_DEF="nexusbrain-trainer" ;;
  consolidation)        TASK_DEF="nexusbrain-consolidation" ;;
  dmn)                  TASK_DEF="nexusbrain-dmn" ;;
  benchmark)            TASK_DEF="nexusbrain-benchmark" ;;
  benchmark-optimizer)  TASK_DEF="nexusbrain-benchmark-optimizer" ;;
  git-trainer)          TASK_DEF="nexusbrain-git-trainer" ;;
  cost-agent)           TASK_DEF="nexusbrain-cost-agent" ;;
  orchestrator)         TASK_DEF="nexusbrain-orchestrator" ;;
  weekly)               TASK_DEF="nexusbrain-weekly" ;;
  monthly)              TASK_DEF="nexusbrain-monthly" ;;
  federation)              TASK_DEF="nexusbrain-federation" ;;
  security)                TASK_DEF="nexusbrain-security" ;;
  proactive-intelligence)  TASK_DEF="nexusbrain-proactive" ;;
  org-updater)             TASK_DEF="nexusbrain-org-updater" ;;
  outcome-resolver)        TASK_DEF="nexusbrain-outcome-resolver" ;;
  ci-healer)               TASK_DEF="nexusbrain-ci-healer" ;;
  *)
    echo "ERROR: Unknown process '${PROCESS}'. Run without arguments to see available processes."
    exit 1
    ;;
esac

# Get networking info
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region "${REGION}")
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${DEFAULT_VPC}" --query "Subnets[0:2].SubnetId" --output text --region "${REGION}" | tr '\t' ',')
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=nexusbrain-training-sg" "Name=vpc-id,Values=${DEFAULT_VPC}" --query "SecurityGroups[0].GroupId" --output text --region "${REGION}")

echo "============================================"
echo "  Running: ${TASK_DEF}"
echo "  Cluster: ${CLUSTER_NAME}"
echo "============================================"
echo ""

# Run the task
TASK_ARN=$(aws ecs run-task \
  --cluster "${CLUSTER_NAME}" \
  --task-definition "${TASK_DEF}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(echo ${SUBNETS} | tr ',' ',')],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
  --query "tasks[0].taskArn" \
  --output text \
  --region "${REGION}")

TASK_ID=$(echo "${TASK_ARN}" | awk -F'/' '{print $NF}')

echo "Task started: ${TASK_ID}"
echo ""
echo "Watch logs:"
echo "  aws logs tail /ecs/nexusbrain-training --follow --filter-pattern '${PROCESS}' --region ${REGION}"
echo ""
echo "Check status:"
echo "  aws ecs describe-tasks --cluster ${CLUSTER_NAME} --tasks ${TASK_ARN} --query 'tasks[0].lastStatus' --output text --region ${REGION}"
echo ""

# Wait for task to complete
echo "Waiting for task to finish..."
aws ecs wait tasks-stopped --cluster "${CLUSTER_NAME}" --tasks "${TASK_ARN}" --region "${REGION}" 2>/dev/null || true

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "${CLUSTER_NAME}" \
  --tasks "${TASK_ARN}" \
  --query "tasks[0].containers[0].exitCode" \
  --output text \
  --region "${REGION}" 2>/dev/null)

STATUS=$(aws ecs describe-tasks \
  --cluster "${CLUSTER_NAME}" \
  --tasks "${TASK_ARN}" \
  --query "tasks[0].lastStatus" \
  --output text \
  --region "${REGION}" 2>/dev/null)

echo ""
if [ "${EXIT_CODE}" = "0" ]; then
  echo "Task completed successfully (exit code: 0)"
else
  echo "Task finished with status: ${STATUS}, exit code: ${EXIT_CODE}"
  echo ""
  echo "Check logs for errors:"
  echo "  aws logs tail /ecs/nexusbrain-training --since 30m --region ${REGION}"
fi

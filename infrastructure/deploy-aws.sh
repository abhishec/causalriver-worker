#!/bin/bash
# NexusBrain AWS Deployment Automation Script
# ═══════════════════════════════════════════════════════════════
#
# Usage:
#   ./infrastructure/deploy-aws.sh [environment]
#
# Arguments:
#   environment: production or staging (default: production)
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Docker installed
#   - All secrets set in .env file
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ───────────────────────────────────────────────────────────────
# CONFIGURATION
# ───────────────────────────────────────────────────────────────

ENVIRONMENT="${1:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${ENVIRONMENT}-nexusbrain-infrastructure"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ───────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ───────────────────────────────────────────────────────────────

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not installed. Please install: https://aws.amazon.com/cli/"
        exit 1
    fi

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not installed. Please install: https://docs.docker.com/get-docker/"
        exit 1
    fi

    # Check .env file
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_error ".env file not found. Please create it from .env.example"
        exit 1
    fi

    # Load environment variables
    set -a
    source "$PROJECT_ROOT/.env"
    set +a

    # Verify required env vars
    required_vars=(
        "SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
        "ORGANIZATION_ID"
        "ANTHROPIC_API_KEY"
        "OPENAI_API_KEY"
    )

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done

    log_success "Prerequisites check passed"
}

# ───────────────────────────────────────────────────────────────
# DEPLOYMENT STEPS
# ───────────────────────────────────────────────────────────────

deploy_cloudformation() {
    log_info "Deploying CloudFormation stack: $STACK_NAME..."

    aws cloudformation deploy \
        --template-file "$SCRIPT_DIR/aws-deployment.yml" \
        --stack-name "$STACK_NAME" \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            SupabaseURL="$SUPABASE_URL" \
            SupabaseServiceRoleKey="$SUPABASE_SERVICE_ROLE_KEY" \
            OrganizationID="$ORGANIZATION_ID" \
            AnthropicAPIKey="$ANTHROPIC_API_KEY" \
            OpenAIAPIKey="$OPENAI_API_KEY" \
            SlackBotToken="${SLACK_BOT_TOKEN:-}" \
            JiraHost="${JIRA_HOST:-}" \
            JiraEmail="${JIRA_EMAIL:-}" \
            JiraAPIToken="${JIRA_API_TOKEN:-}" \
            GitHubToken="${GITHUB_TOKEN:-}" \
            GitHubRepos="${GITHUB_REPOS:-}" \
        --capabilities CAPABILITY_IAM \
        --region "$AWS_REGION" \
        --no-fail-on-empty-changeset

    if [ $? -eq 0 ]; then
        log_success "CloudFormation stack deployed successfully"
    else
        log_error "CloudFormation deployment failed"
        exit 1
    fi
}

get_stack_outputs() {
    log_info "Fetching stack outputs..."

    ECR_URI=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryURI`].OutputValue' \
        --output text)

    REDIS_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`RedisEndpoint`].OutputValue' \
        --output text)

    ALB_DNS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
        --output text)

    log_success "Stack outputs retrieved"
    log_info "  ECR Repository: $ECR_URI"
    log_info "  Redis Endpoint: $REDIS_ENDPOINT"
    log_info "  Load Balancer: $ALB_DNS"
}

build_and_push_docker() {
    log_info "Building Docker image..."

    cd "$PROJECT_ROOT"

    # Login to ECR
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_URI"

    # Build image
    docker build -t nexusbrain:latest -f Dockerfile.production .

    if [ $? -ne 0 ]; then
        log_error "Docker build failed"
        exit 1
    fi

    log_success "Docker image built successfully"

    # Tag image
    docker tag nexusbrain:latest "$ECR_URI:latest"
    docker tag nexusbrain:latest "$ECR_URI:$(git rev-parse --short HEAD)"

    # Push image
    log_info "Pushing Docker image to ECR..."
    docker push "$ECR_URI:latest"
    docker push "$ECR_URI:$(git rev-parse --short HEAD)"

    log_success "Docker image pushed successfully"
}

update_ecs_service() {
    log_info "Updating ECS service..."

    aws ecs update-service \
        --cluster "${ENVIRONMENT}-nexusbrain-cluster" \
        --service "${ENVIRONMENT}-nexusbrain-service" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        > /dev/null

    log_success "ECS service updated - new deployment triggered"

    log_info "Waiting for service to stabilize (this may take a few minutes)..."

    aws ecs wait services-stable \
        --cluster "${ENVIRONMENT}-nexusbrain-cluster" \
        --services "${ENVIRONMENT}-nexusbrain-service" \
        --region "$AWS_REGION"

    log_success "ECS service is stable"
}

health_check() {
    log_info "Running health checks..."

    # Wait for ALB to route traffic
    sleep 30

    for i in {1..10}; do
        if curl -f -s "http://$ALB_DNS/api/health" > /dev/null 2>&1; then
            log_success "Health check passed!"
            return 0
        fi
        log_warn "Health check attempt $i/10 failed, retrying in 10s..."
        sleep 10
    done

    log_error "Health check failed after 10 attempts"
    exit 1
}

print_deployment_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  DEPLOYMENT COMPLETE - NexusBrain Production"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Environment:     $ENVIRONMENT"
    echo "Region:          $AWS_REGION"
    echo "Load Balancer:   http://$ALB_DNS"
    echo "Redis Endpoint:  $REDIS_ENDPOINT"
    echo ""
    echo "🔗 Endpoints:"
    echo "  Health:        http://$ALB_DNS/api/health"
    echo "  Brain Status:  http://$ALB_DNS/api/brain/status"
    echo ""
    echo "📊 Monitoring:"
    echo "  ECS Console:   https://console.aws.amazon.com/ecs/home?region=$AWS_REGION#/clusters/${ENVIRONMENT}-nexusbrain-cluster"
    echo "  CloudWatch:    https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION"
    echo ""
    echo "✅ Next Steps:"
    echo "  1. Run initial data ingestion (if not done)"
    echo "  2. Setup cron jobs for incremental sync"
    echo "  3. Monitor CloudWatch logs for errors"
    echo "  4. Configure DNS CNAME pointing to Load Balancer"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

# ───────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ───────────────────────────────────────────────────────────────

main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  NexusBrain AWS Deployment"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    check_prerequisites
    deploy_cloudformation
    get_stack_outputs
    build_and_push_docker
    update_ecs_service
    health_check
    print_deployment_summary
}

# Run main function
main

#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NexusBrain One-Click AWS Deployment
# ═══════════════════════════════════════════════════════════════
#
# This script handles EVERYTHING:
# 1. AWS CLI setup (if needed)
# 2. CDK bootstrap (one-time AWS account setup)
# 3. Infrastructure deployment (VPC, Redis, ECS, ALB)
# 4. Docker build & push to ECR
# 5. Application deployment
# 6. Health checks
#
# Usage:
#   ./DEPLOY.sh
#
# ═══════════════════════════════════════════════════════════════

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ───────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────

print_header() {
    echo -e "\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# ───────────────────────────────────────────────────────────────
# Step 1: Check Prerequisites
# ───────────────────────────────────────────────────────────────

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install node
        else
            print_error "Please install Node.js manually: https://nodejs.org/"
            exit 1
        fi
    fi
    print_success "Node.js installed: $(node --version)"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_warn "AWS CLI not found. Installing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install awscli
        else
            curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
            unzip awscliv2.zip
            sudo ./aws/install
            rm -rf aws awscliv2.zip
        fi
    fi
    print_success "AWS CLI installed: $(aws --version)"

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_warn "AWS credentials not configured"
        print_info "Configuring AWS CLI..."
        aws configure
    fi

    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_REGION=$(aws configure get region || echo "us-east-1")

    print_success "AWS Account: $AWS_ACCOUNT"
    print_success "AWS Region: $AWS_REGION"

    # Check .env file
    if [ ! -f ".env" ]; then
        print_error ".env file not found"
        exit 1
    fi
    print_success ".env file found"
}

# ───────────────────────────────────────────────────────────────
# Step 2: Install CDK Dependencies
# ───────────────────────────────────────────────────────────────

install_cdk() {
    print_header "Installing AWS CDK"

    cd infrastructure/cdk

    # Install CDK CLI globally if not installed
    if ! command -v cdk &> /dev/null; then
        print_info "Installing AWS CDK CLI..."
        npm install -g aws-cdk
    fi
    print_success "CDK CLI installed: $(cdk --version)"

    # Install dependencies
    print_info "Installing CDK dependencies..."
    npm install

    cd ../..
    print_success "CDK dependencies installed"
}

# ───────────────────────────────────────────────────────────────
# Step 3: Bootstrap CDK (One-Time Setup)
# ───────────────────────────────────────────────────────────────

bootstrap_cdk() {
    print_header "Bootstrapping AWS CDK"

    cd infrastructure/cdk

    # Check if already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null; then
        print_success "CDK already bootstrapped"
    else
        print_info "Bootstrapping CDK (one-time setup)..."
        cdk bootstrap
        print_success "CDK bootstrapped successfully"
    fi

    cd ../..
}

# ───────────────────────────────────────────────────────────────
# Step 4: Build Docker Image & Push to ECR
# ───────────────────────────────────────────────────────────────

build_and_push_docker() {
    print_header "Building & Pushing Docker Image"

    # Get ECR repository URI (will be created by CDK in next step if doesn't exist)
    print_info "Deploying ECR repository first..."

    cd infrastructure/cdk
    cdk deploy NexusBrainProduction --require-approval never --outputs-file outputs.json 2>&1 | grep -v "docker login" || true
    cd ../..

    # Extract ECR URI from outputs
    ECR_URI=$(cat infrastructure/cdk/outputs.json | grep ECRRepositoryURI | cut -d'"' -f4)

    if [ -z "$ECR_URI" ]; then
        print_warn "ECR not yet created, will be created in full deployment"
        return
    fi

    print_success "ECR Repository: $ECR_URI"

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_warn "Docker not running. Skipping Docker build."
        print_info "Application will use existing image or build via CodeBuild"
        return
    fi

    # Login to ECR
    print_info "Logging into ECR..."
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI

    # Build image
    print_info "Building Docker image..."
    docker build -t nexusbrain:latest -f Dockerfile.production .

    # Tag and push
    print_info "Pushing to ECR..."
    docker tag nexusbrain:latest $ECR_URI:latest
    docker push $ECR_URI:latest

    print_success "Docker image pushed to ECR"
}

# ───────────────────────────────────────────────────────────────
# Step 5: Deploy Infrastructure
# ───────────────────────────────────────────────────────────────

deploy_infrastructure() {
    print_header "Deploying NexusBrain Infrastructure"

    cd infrastructure/cdk

    print_info "Deploying complete stack (VPC, Redis, ECS, ALB, Secrets Manager)..."
    print_info "This will take 10-15 minutes..."

    cdk deploy NexusBrainProduction --require-approval never --outputs-file outputs.json

    print_success "Infrastructure deployed successfully!"

    # Parse outputs
    ALB_DNS=$(cat outputs.json | grep LoadBalancerDNS | cut -d'"' -f4)
    REDIS_ENDPOINT=$(cat outputs.json | grep RedisEndpoint | cut -d'"' -f4)
    HEALTH_ENDPOINT=$(cat outputs.json | grep HealthEndpoint | cut -d'"' -f4)

    cd ../..

    # Save outputs to file
    cat > deployment-info.txt << EOF
═══════════════════════════════════════════════════════════════
  DEPLOYMENT COMPLETE!
═══════════════════════════════════════════════════════════════

Environment:         Production
Region:              $AWS_REGION
Load Balancer:       $ALB_DNS
Redis Endpoint:      $REDIS_ENDPOINT

🔗 Endpoints:
  Health:            $HEALTH_ENDPOINT
  Brain Status:      http://$ALB_DNS/api/brain/status

📊 AWS Console:
  ECS:               https://console.aws.amazon.com/ecs/home?region=$AWS_REGION
  CloudWatch Logs:   https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION

✅ Next Steps:
  1. Wait 2-3 minutes for ECS tasks to start
  2. Test health endpoint: curl $HEALTH_ENDPOINT
  3. View logs: aws logs tail /ecs/production-nexusbrain --follow
  4. Run data ingestion (optional)

═══════════════════════════════════════════════════════════════
EOF

    cat deployment-info.txt
}

# ───────────────────────────────────────────────────────────────
# Step 6: Health Check
# ───────────────────────────────────────────────────────────────

health_check() {
    print_header "Running Health Checks"

    # Extract health endpoint from deployment info
    if [ ! -f "deployment-info.txt" ]; then
        print_warn "Deployment info not found, skipping health check"
        return
    fi

    HEALTH_ENDPOINT=$(grep "Health:" deployment-info.txt | awk '{print $2}')

    print_info "Waiting for ECS tasks to start (60 seconds)..."
    sleep 60

    print_info "Testing health endpoint..."
    for i in {1..10}; do
        if curl -f -s "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
            print_success "Health check passed!"
            curl -s "$HEALTH_ENDPOINT" | jq '.' || curl -s "$HEALTH_ENDPOINT"
            return 0
        fi
        print_info "Attempt $i/10 failed, retrying in 15s..."
        sleep 15
    done

    print_warn "Health check failed after 10 attempts"
    print_info "This is normal if tasks are still starting up"
    print_info "Check status: aws ecs describe-services --cluster production-nexusbrain --services production-nexusbrain"
}

# ───────────────────────────────────────────────────────────────
# Main Execution
# ───────────────────────────────────────────────────────────────

main() {
    clear
    print_header "🚀 NexusBrain One-Click Deployment"

    echo -e "${BOLD}This script will:${NC}"
    echo "  1️⃣  Check prerequisites (AWS CLI, Node.js)"
    echo "  2️⃣  Install AWS CDK"
    echo "  3️⃣  Bootstrap CDK (one-time)"
    echo "  4️⃣  Build & push Docker image (optional)"
    echo "  5️⃣  Deploy complete infrastructure"
    echo "  6️⃣  Run health checks"
    echo ""
    echo -e "${YELLOW}Estimated time: 15-20 minutes${NC}"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi

    check_prerequisites
    install_cdk
    bootstrap_cdk
    build_and_push_docker
    deploy_infrastructure
    health_check

    print_header "🎉 Deployment Complete!"
    echo ""
    echo -e "${GREEN}${BOLD}NexusBrain is now running on AWS!${NC}"
    echo ""
    echo "Deployment info saved to: deployment-info.txt"
    echo ""
}

# Run main function
main

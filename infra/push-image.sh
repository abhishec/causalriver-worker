#!/bin/bash
# Build and push NexusBrain Docker image to ECR
#
# Usage: ./infra/push-image.sh

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
ECR_REPO="nexusbrain-trainer"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

# Get the project root (where Dockerfile lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

echo "============================================"
echo "  Build & Push NexusBrain Docker Image"
echo "============================================"
echo ""

# Step 1: Login to ECR
echo ">>> Logging in to ECR..."
aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo ""

# Step 2: Build
echo ">>> Building Docker image..."
cd "${PROJECT_DIR}"
docker build --platform linux/amd64 -t "${ECR_REPO}:latest" .
echo ""

# Step 3: Tag
echo ">>> Tagging image..."
docker tag "${ECR_REPO}:latest" "${ECR_URI}:latest"

# Also tag with timestamp for version tracking
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker tag "${ECR_REPO}:latest" "${ECR_URI}:${TIMESTAMP}"
echo "    Tagged: ${ECR_URI}:latest"
echo "    Tagged: ${ECR_URI}:${TIMESTAMP}"
echo ""

# Step 4: Push
echo ">>> Pushing to ECR..."
docker push "${ECR_URI}:latest"
docker push "${ECR_URI}:${TIMESTAMP}"
echo ""

echo "============================================"
echo "  Image pushed successfully!"
echo "============================================"
echo ""
echo "Image URI: ${ECR_URI}:latest"
echo "Version:   ${ECR_URI}:${TIMESTAMP}"
echo ""
echo "To test locally:"
echo "  docker run --rm -e BRAIN_PROCESS=dmn -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... ${ECR_REPO}:latest"

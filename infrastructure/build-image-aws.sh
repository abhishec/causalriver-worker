#!/bin/bash
# Build Docker image using AWS CodeBuild (no local Docker needed)
set -e

echo "═══════════════════════════════════════════════════════════════"
echo "NexusBrain - Build Docker Image in AWS CodeBuild"
echo "═══════════════════════════════════════════════════════════════"

# Configuration
PROJECT_NAME="nexusbrain-image-builder"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/nexusbrain"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_LOCATION="$PROJECT_ROOT"

echo ""
echo "📋 Configuration:"
echo "  Project: $PROJECT_NAME"
echo "  ECR URI: $ECR_URI"
echo "  Region: $REGION"
echo ""

# Check if CodeBuild project exists
echo "🔍 Checking if CodeBuild project exists..."
if aws codebuild batch-get-projects --names "$PROJECT_NAME" --region "$REGION" --query 'projects[0].name' --output text 2>/dev/null | grep -q "$PROJECT_NAME"; then
    echo "✅ CodeBuild project exists"
else
    echo "📦 Creating CodeBuild project..."

    # Create CodeBuild service role
    ROLE_NAME="nexusbrain-codebuild-role"

    # Check if role exists
    if ! aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null > /dev/null; then
        echo "Creating IAM role for CodeBuild..."

        cat > /tmp/codebuild-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "codebuild.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file:///tmp/codebuild-trust-policy.json \
            --region "$REGION"

        # Attach policies
        aws iam attach-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-arn "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser" \
            --region "$REGION"

        aws iam attach-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-arn "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess" \
            --region "$REGION"

        echo "✅ IAM role created"
        sleep 10  # Wait for role to propagate
    fi

    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

    # Create CodeBuild project
    cat > /tmp/codebuild-project.json <<EOF
{
  "name": "$PROJECT_NAME",
  "source": {
    "type": "NO_SOURCE",
    "buildspec": "version: 0.2\nphases:\n  pre_build:\n    commands:\n      - echo 'Logging in to Amazon ECR...'\n      - aws ecr get-login-password --region \$AWS_DEFAULT_REGION | docker login --username AWS --password-stdin \$ECR_REPOSITORY_URI\n  build:\n    commands:\n      - echo 'Building Docker image...'\n      - docker build -t \$ECR_REPOSITORY_URI:latest -f Dockerfile.production .\n  post_build:\n    commands:\n      - echo 'Pushing Docker image to ECR...'\n      - docker push \$ECR_REPOSITORY_URI:latest\n      - echo 'Build completed successfully'"
  },
  "artifacts": {
    "type": "NO_ARTIFACTS"
  },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/standard:7.0",
    "computeType": "BUILD_GENERAL1_SMALL",
    "privilegedMode": true,
    "environmentVariables": [
      {
        "name": "ECR_REPOSITORY_URI",
        "value": "$ECR_URI",
        "type": "PLAINTEXT"
      },
      {
        "name": "AWS_DEFAULT_REGION",
        "value": "$REGION",
        "type": "PLAINTEXT"
      }
    ]
  },
  "serviceRole": "$ROLE_ARN"
}
EOF

    aws codebuild create-project --cli-input-json file:///tmp/codebuild-project.json --region "$REGION"
    echo "✅ CodeBuild project created"
fi

echo ""
echo "🚀 Starting CodeBuild to build Docker image..."

# Zip source code for upload
echo "📦 Preparing source code..."
cd "$PROJECT_ROOT"

# Create temporary directory for source
TEMP_DIR=$(mktemp -d)
echo "  Copying source to $TEMP_DIR..."

# Copy necessary files
cp -r packages "$TEMP_DIR/"
cp -r platform "$TEMP_DIR/"
cp -r scripts "$TEMP_DIR/"
cp Dockerfile.production "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"
cp pnpm-workspace.yaml "$TEMP_DIR/" 2>/dev/null || true
cp pnpm-lock.yaml "$TEMP_DIR/" 2>/dev/null || true
cp .npmrc "$TEMP_DIR/" 2>/dev/null || true
cp turbo.json "$TEMP_DIR/" 2>/dev/null || true
cp tsconfig.base.json "$TEMP_DIR/" 2>/dev/null || true

# Create zip
cd "$TEMP_DIR"
zip -r /tmp/nexusbrain-source.zip . > /dev/null
echo "  ✅ Source packaged"

# Upload to S3
BUCKET_NAME="nexusbrain-codebuild-source-$(aws sts get-caller-identity --query Account --output text)"
echo ""
echo "📤 Uploading source to S3..."

# Create bucket if it doesn't exist
if ! aws s3 ls "s3://$BUCKET_NAME" 2>/dev/null; then
    aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"
    echo "  ✅ S3 bucket created"
fi

aws s3 cp /tmp/nexusbrain-source.zip "s3://$BUCKET_NAME/source.zip" --region "$REGION"
echo "  ✅ Source uploaded"

# Start build
echo ""
echo "🔨 Starting build in AWS CodeBuild..."

BUILD_ID=$(aws codebuild start-build \
    --project-name "$PROJECT_NAME" \
    --source-type-override S3 \
    --source-location-override "$BUCKET_NAME/source.zip" \
    --region "$REGION" \
    --query 'build.id' \
    --output text)

echo "  Build ID: $BUILD_ID"
echo ""
echo "📊 Monitoring build progress..."

# Monitor build
while true; do
    BUILD_STATUS=$(aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$REGION" --query 'builds[0].buildStatus' --output text)

    if [ "$BUILD_STATUS" = "SUCCEEDED" ]; then
        echo ""
        echo "✅ Build completed successfully!"
        echo ""
        echo "📦 Docker image pushed to: $ECR_URI:latest"
        echo ""
        echo "🔄 ECS Service should now start deploying tasks..."
        break
    elif [ "$BUILD_STATUS" = "FAILED" ] || [ "$BUILD_STATUS" = "FAULT" ] || [ "$BUILD_STATUS" = "TIMED_OUT" ] || [ "$BUILD_STATUS" = "STOPPED" ]; then
        echo ""
        echo "❌ Build failed with status: $BUILD_STATUS"
        echo ""
        echo "📋 Build logs:"
        aws codebuild batch-get-builds --ids "$BUILD_ID" --region "$REGION" --query 'builds[0].logs.deepLink' --output text
        exit 1
    else
        echo "  Status: $BUILD_STATUS"
        sleep 10
    fi
done

# Cleanup
rm -rf "$TEMP_DIR"
rm /tmp/nexusbrain-source.zip

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Image Build Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next: The ECS service will automatically pull the new image and"
echo "      start running tasks. Check deployment status with:"
echo ""
echo "  aws ecs describe-services --cluster production-nexusbrain --services production-nexusbrain --region us-east-1"
echo ""

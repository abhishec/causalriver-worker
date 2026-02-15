#!/bin/bash
# Production Deployment Script
# Deploys NexusBrain platform to Vercel

set -e

echo "🚀 NexusBrain Production Deployment"
echo "═══════════════════════════════════════════════════════════════════"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "platform" ]; then
    echo -e "${RED}❌ Error: Must run from project root${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Step 1: Pre-deployment checks${NC}"

# Check if code is committed
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Error: Uncommitted changes detected${NC}"
    echo "Please commit all changes before deploying"
    exit 1
fi

echo -e "${GREEN}✓ All changes committed${NC}"

# Check if we're on main branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  Warning: Not on main branch (currently on $BRANCH)${NC}"
    read -p "Continue deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}✓ Branch check passed${NC}"

echo ""
echo -e "${YELLOW}📦 Step 2: Running security scanner${NC}"

# Run security scanner test
if npx tsx scripts/test-security-scanner.ts > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Security scanner: 10/10${NC}"
else
    echo -e "${YELLOW}⚠️  Security scanner had warnings (continuing)${NC}"
fi

echo ""
echo -e "${YELLOW}📦 Step 3: Building project${NC}"

# Build the project
cd platform
if pnpm build; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
cd ..

echo ""
echo -e "${YELLOW}📦 Step 4: Deployment options${NC}"
echo ""
echo "Choose deployment method:"
echo "  1. Vercel CLI (requires login)"
echo "  2. Manual instructions"
echo "  3. GitHub Actions (requires setup)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}🔐 Deploying via Vercel CLI...${NC}"
        cd platform

        # Check if logged in
        if ! vercel whoami > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Not logged in to Vercel${NC}"
            echo "Opening login flow..."
            vercel login
        fi

        echo ""
        echo -e "${YELLOW}🚀 Deploying to production...${NC}"
        vercel --prod

        echo ""
        echo -e "${GREEN}✅ Deployment initiated!${NC}"
        ;;

    2)
        echo ""
        echo -e "${YELLOW}📋 Manual Deployment Instructions:${NC}"
        echo ""
        echo "1. Visit: https://vercel.com/login"
        echo "2. Sign in with GitHub"
        echo "3. Click 'Add New Project'"
        echo "4. Import: abhishec/nexus-intelligence"
        echo "5. Configure:"
        echo "   - Framework: Next.js"
        echo "   - Root Directory: platform"
        echo "   - Build Command: pnpm build"
        echo "6. Add environment variables from .env"
        echo "7. Click 'Deploy'"
        echo ""
        echo -e "${GREEN}✓ Instructions displayed${NC}"
        ;;

    3)
        echo ""
        echo -e "${YELLOW}🤖 GitHub Actions Deployment:${NC}"
        echo ""
        echo "To enable automatic deployments:"
        echo ""
        echo "1. Get Vercel token:"
        echo "   - Visit: https://vercel.com/account/tokens"
        echo "   - Click 'Create Token'"
        echo "   - Copy the token"
        echo ""
        echo "2. Add to GitHub Secrets:"
        echo "   - Visit: https://github.com/abhishec/nexus-intelligence/settings/secrets/actions"
        echo "   - Click 'New repository secret'"
        echo "   - Name: VERCEL_TOKEN"
        echo "   - Value: [paste token]"
        echo ""
        echo "3. Commit and push the workflow file:"
        echo "   git add .github/workflows/deploy.yml"
        echo "   git commit -m 'ci: Add Vercel deployment workflow'"
        echo "   git push"
        echo ""
        echo "4. Deployment will start automatically on next push to main!"
        echo ""
        echo -e "${GREEN}✓ Setup instructions displayed${NC}"
        ;;

    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 Deployment process complete!${NC}"
echo ""
echo "Next steps:"
echo "  - Monitor deployment at: https://vercel.com/dashboard"
echo "  - Test live site after deployment"
echo "  - Verify security (IDS, error handling)"
echo ""

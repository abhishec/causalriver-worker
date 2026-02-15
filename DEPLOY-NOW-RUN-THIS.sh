#!/bin/bash
# 🚀 DEPLOY TO PRODUCTION - RUN THIS IN YOUR TERMINAL
# This will work because it runs in YOUR interactive shell session

echo "🚀 Deploying NexusBrain to Vercel Production"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

cd "$(dirname "$0")/platform"

echo "Step 1: Vercel Login"
echo "A browser window will open. Click 'Confirm' to authenticate."
echo ""
read -p "Press ENTER to continue..."

# Login to Vercel (opens browser)
vercel login

echo ""
echo "Step 2: Deploy to Production"
echo "Deploying your platform..."
echo ""

# Deploy to production
vercel --prod

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "🎉 DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Your production URL is shown above ⬆️"
echo ""
echo "Next steps:"
echo "1. Copy your production URL"
echo "2. Test security: ./scripts/test-production-security.sh YOUR_URL"
echo ""

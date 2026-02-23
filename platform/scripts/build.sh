#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Safe Next.js 15.5 build wrapper for App Router projects
#
# Fixes the route group PageNotFoundError (Case 006) via:
# 1. Upgrade to Next.js 15.5.12 — fixes webpack module resolution for route groups
# 2. suppress-document-error.cjs — intercepts /_document unhandled rejections
# 3. All API routes marked force-dynamic — prevents prerender attempts
# 4. 8 GB memory — prevents OOM in webpack workers
#
# Historical context (Case 006):
# - Next.js 15.3.3 had a bug where "Collecting page data" used URL paths
#   (/login) but modules were under route groups ((auth)/login) → ENOENT
# - Upgrading to 15.5.12 fixes this for webpack builds
# - Turbopack builds still fail at "Collecting page data" (Turbopack bug)
# - Dev server uses Turbopack fine; build uses webpack
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PLATFORM_DIR"

# ── Ensure .next/package.json exists (needed after clean builds) ──────────────
mkdir -p "$PLATFORM_DIR/.next"
if [ ! -f "$PLATFORM_DIR/.next/package.json" ]; then
  echo '{"type":"commonjs"}' > "$PLATFORM_DIR/.next/package.json"
fi

# ── Set Node options ─────────────────────────────────────────────────────────
# 1. Give webpack workers enough memory (8 GB)
# 2. Suppress /_document unhandled rejection in App Router projects
SUPPRESS_SCRIPT="$SCRIPT_DIR/suppress-document-error.cjs"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192 --require $SUPPRESS_SCRIPT"

echo "🔨 Building Next.js 15.5 (App Router, webpack)..."

npx next build "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Build succeeded"
else
  echo "❌ Build failed (exit $EXIT_CODE)"
fi

exit $EXIT_CODE

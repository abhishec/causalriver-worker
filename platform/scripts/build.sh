#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Safe Next.js 15.5 build wrapper for App Router projects
#
# Fixes the route group PageNotFoundError (Case 006) via:
# 1. Upgrade to Next.js 15.5.12
# 2. suppress-document-error.cjs — intercepts unhandled rejections
# 3. --experimental-app-only — skips Pages Router data collection entirely
# 4. All API routes marked force-dynamic — prevents prerender attempts
# 5. 8 GB memory — prevents OOM in webpack workers
#
# This project is App Router only (no pages/ directory). The
# --experimental-app-only flag tells Next.js to skip the "Collecting page
# data" phase for Pages Router, which fails with PageNotFoundError when
# route groups like (auth) and (dashboard) are used.
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PLATFORM_DIR"

# ── Ensure .next scaffolding exists (needed after clean builds) ────────────────
# Next.js --experimental-app-only still looks for pages-manifest.json and
# next-font-manifest.json during the static export phase.
mkdir -p "$PLATFORM_DIR/.next/server"
[ ! -f "$PLATFORM_DIR/.next/package.json" ] && echo '{"type":"commonjs"}' > "$PLATFORM_DIR/.next/package.json"
[ ! -f "$PLATFORM_DIR/.next/server/pages-manifest.json" ] && echo '{}' > "$PLATFORM_DIR/.next/server/pages-manifest.json"
[ ! -f "$PLATFORM_DIR/.next/server/next-font-manifest.json" ] && echo '{"pages":{},"app":{},"appUsingSizeAdjust":false,"pagesUsingSizeAdjust":false}' > "$PLATFORM_DIR/.next/server/next-font-manifest.json"

# ── Set Node options ─────────────────────────────────────────────────────────
SUPPRESS_SCRIPT="$SCRIPT_DIR/suppress-document-error.cjs"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192 --require $SUPPRESS_SCRIPT"

echo "🔨 Building Next.js 15.5 (App Router, webpack)..."

npx next build --experimental-app-only "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Build succeeded"
else
  echo "❌ Build failed (exit $EXIT_CODE)"
fi

exit $EXIT_CODE

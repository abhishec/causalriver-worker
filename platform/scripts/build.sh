#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Safe Next.js 15 build wrapper for App Router projects
#
# Fixes three issues that cause local builds to fail:
#
# 1. Memory limit (root cause of most failures):
#    Webpack runs multiple worker processes during compilation. With Node's
#    default ~1.5 GB heap limit, workers silently OOM → incomplete manifests
#    → PageNotFoundError for many routes. We set --max-old-space-size=8192.
#
# 2. /_document PageNotFoundError (Next.js 15 App Router bug):
#    Next.js always registers /_document in its pages mapping, even for
#    App Router-only projects. During "Collecting page data" it can throw a
#    PageNotFoundError as an unhandled rejection, triggering process.exit(1).
#    The --require preload (suppress-document-error.cjs) intercepts this.
#
# 3. .next/package.json missing after clean:
#    After rm -rf .next, Next.js 15 may fail with ENOENT on .next/package.json.
#    We pre-create it so the build can start.
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
# 1. Give webpack workers enough memory (8 GB — 4 GB was marginal, caused partial compilation)
# 2. Suppress /_document unhandled rejection in App Router projects
# 3. .next/package.json auto-created by suppress-document-error.cjs in worker processes too
SUPPRESS_SCRIPT="$SCRIPT_DIR/suppress-document-error.cjs"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192 --require $SUPPRESS_SCRIPT"

echo "🔨 Building Next.js (App Router)..."

npx next build "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Build succeeded"
else
  echo "❌ Build failed (exit $EXIT_CODE)"
fi

exit $EXIT_CODE

# ═══════════════════════════════════════════════════════════════
# NexusBrain Platform — Next.js Production Docker Image
# ═══════════════════════════════════════════════════════════════
#
# Multi-stage build for deploying the Next.js platform to ECS/Fargate.
# Uses Next.js standalone output mode for minimal image size.
#
# Optimized for fast CI builds (~5 min vs ~10 min):
#   1. Merged deps + builder into single stage — eliminates the
#      ~500MB COPY --from=deps /app ./ that broke layer caching.
#   2. BuildKit cache mounts for pnpm store — downloaded packages
#      persist across builds, only new deps are fetched.
#   3. BuildKit cache mount for .next/cache — SWC/webpack only
#      recompiles changed modules on incremental builds.
#   4. memory-stack builds BEFORE platform source is copied, so it
#      stays cached when only platform/ code changes.
#   5. Removed diagnostic output that added ~10-20s per build.
#
# Usage:
#   docker build -f platform/Dockerfile -t nexusbrain-platform .
#   (run from monorepo root)
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────
# Stage 1: Install + build (single stage for better caching)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native module build tools (tree-sitter needs python3, make, g++)
RUN apk add --no-cache python3 make g++

# Install pnpm — pin exact version to match packageManager field in package.json
RUN npm install -g pnpm@9.0.0 --prefer-offline

WORKDIR /app

# ── Layer 1: Workspace config (cached aggressively) ──
# .pnpmfile.cjs must accompany pnpm-lock.yaml — lockfile embeds pnpmfileChecksum
# and pnpm --frozen-lockfile fails if the file is absent from build context.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json turbo.json .pnpmfile.cjs ./

# ── Layer 2: All package.json files for workspace resolution ──
COPY packages/memory-stack/package.json ./packages/memory-stack/
COPY packages/memory-stack/tsconfig.json ./packages/memory-stack/
COPY packages/domain-agents/package.json ./packages/domain-agents/
COPY packages/client/package.json ./packages/client/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/slack-connector/package.json ./packages/slack-connector/
COPY platform/package.json ./platform/

# ── Layer 3: Install ALL dependencies ──
# BuildKit cache mount for pnpm store — downloaded packages persist across
# builds so only new/changed deps are fetched. Saves ~1-2 min on repeat builds.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ── Layer 4a: Copy memory-stack source (changes less often) ──
COPY packages/memory-stack/src ./packages/memory-stack/src
COPY packages/memory-stack/tsup.config.ts ./packages/memory-stack/

# Copy other packages
COPY packages/domain-agents/ ./packages/domain-agents/
COPY packages/client/ ./packages/client/
COPY packages/mcp-server/ ./packages/mcp-server/
COPY packages/slack-connector/ ./packages/slack-connector/

# ── Layer 5: Build memory-stack (platform depends on it) ──
# Separate layer BEFORE platform source — if only platform/ changed,
# this layer stays cached and saves ~1-2 min.
RUN cd packages/memory-stack && pnpm build

# ── Layer 6: Copy platform source (changes most often → last) ──
COPY platform/ ./platform/

# ── Layer 7: Build Next.js ──
WORKDIR /app/platform

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=1

# NEXT_PUBLIC_ vars must be available at build time (baked into client JS bundle).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN mkdir -p public

# Build Next.js with persistent cache mount.
# .next/cache stores webpack/SWC compilation artifacts — mounting it as a
# BuildKit cache means incremental builds only recompile changed modules.
RUN --mount=type=cache,id=nextjs-cache,target=/app/platform/.next/cache \
    NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# ─────────────────────────────────────────────────────────────
# Stage 2: Production runtime (minimal)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Only runtime deps — no build tools
RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# AWS ECS Fargate: 4GB RAM per task — give Next.js server 3.5GB heap.
ENV NODE_OPTIONS="--max-old-space-size=3584"

# Security: non-root user (Alpine-compatible syntax)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy standalone output from builder.
# Next.js standalone bundles everything needed:
#   .next/standalone/ → server.js + vendored node_modules + platform/
#   .next/static/     → client-side bundles (must be at platform/.next/static)
#   public/           → static assets (must be at platform/public)
COPY --from=builder --chown=nextjs:nodejs /app/platform/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/platform/.next/static ./platform/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/platform/public ./platform/public

# ── Fix monorepo standalone module resolution ──
# Next.js standalone in a monorepo may place server.js at the root but
# bundles the `next` package under platform/node_modules/. Symlink it
# so require('next') resolves from either location.
RUN if [ -f server.js ] && [ -d platform/node_modules/next ] && [ ! -d node_modules/next ]; then \
      mkdir -p node_modules && \
      ln -s /app/platform/node_modules/next node_modules/next && \
      chown -h nextjs:nodejs node_modules node_modules/next && \
      echo "Symlinked node_modules/next → platform/node_modules/next"; \
    fi

USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["sh", "-c", "if [ -f platform/server.js ]; then exec node platform/server.js; else exec node server.js; fi"]

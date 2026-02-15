# ═══════════════════════════════════════════════════════════════
# NexusBrain Platform — Next.js Production Docker Image
# ═══════════════════════════════════════════════════════════════
#
# Multi-stage build for deploying the Next.js platform to ECS/Fargate.
# Uses Next.js standalone output mode for minimal image size.
#
# Key design decisions:
#   1. pnpm workspace with hoisted node-linker — workspace symlinks
#      must be created via `pnpm install` (not copied between stages).
#   2. memory-stack must be built BEFORE platform (turbo dependency).
#   3. Next.js standalone bundles its own node_modules — the runner
#      stage only needs .next/standalone + static + public.
#   4. Native modules (tree-sitter) are externalized via
#      serverExternalPackages in next.config.ts.
#
# Usage:
#   docker build -f platform/Dockerfile -t nexusbrain-platform .
#   (run from monorepo root)
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Native module build tools (tree-sitter needs python3, make, g++)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# ── Layer 1: Workspace config (cached aggressively) ──
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json turbo.json ./

# ── Layer 2: All package.json files for workspace resolution ──
COPY packages/memory-stack/package.json ./packages/memory-stack/
COPY packages/memory-stack/tsconfig.json ./packages/memory-stack/
COPY packages/domain-agents/package.json ./packages/domain-agents/
COPY packages/client/package.json ./packages/client/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/slack-connector/package.json ./packages/slack-connector/
COPY platform/package.json ./platform/

# ── Layer 3: Install ALL dependencies ──
# Need devDeps for tsup (memory-stack build) and Next.js build tooling.
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: Build everything
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy installed workspace (preserves hoisted symlinks + node_modules)
COPY --from=deps /app ./

# Copy source code
COPY packages/memory-stack/src ./packages/memory-stack/src
COPY packages/memory-stack/tsup.config.ts ./packages/memory-stack/

# Copy other packages (in case of cross-references)
COPY packages/domain-agents/ ./packages/domain-agents/
COPY packages/client/ ./packages/client/
COPY packages/mcp-server/ ./packages/mcp-server/
COPY packages/slack-connector/ ./packages/slack-connector/

# Copy platform source
COPY platform/ ./platform/

# Step 1: Build memory-stack (platform depends on it)
RUN cd packages/memory-stack && pnpm build

# Step 2: Build Next.js platform with standalone output
WORKDIR /app/platform

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=1

# Create public directory if it doesn't exist
RUN mkdir -p public

# Build with standalone mode enabled + increased memory
RUN NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_PRIVATE_STANDALONE=true \
    pnpm build

# ─────────────────────────────────────────────────────────────
# Stage 3: Production runtime (minimal)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Only runtime deps — no build tools
RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

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

USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Next.js standalone server.js runs from the standalone root
CMD ["node", "server.js"]

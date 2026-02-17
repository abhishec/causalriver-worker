# ═══════════════════════════════════════════════════════════════
# NexusBrain Brain Orchestrator — Production Docker Image
# ═══════════════════════════════════════════════════════════════
#
# Multi-stage build optimized for pnpm monorepo with workspace links.
#
# Key design decisions:
#   1. Scripts import from memory-stack/src (TypeScript source) and are
#      transpiled at runtime by tsx — so we need FULL source, not dist/.
#   2. pnpm with node-linker=hoisted creates workspace symlinks that break
#      when copied between Docker stages — we install deps in the builder
#      stage and copy the ENTIRE /app to the runner.
#   3. Native modules (tree-sitter) need build tools at install time.
#   4. We build memory-stack to validate types, but tsx uses src/ at runtime.
#
# Usage:
#   docker build -t nexusbrain .
#   docker run -e SUPABASE_URL=... -e SUPABASE_KEY=... nexusbrain
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies + build
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native module build tools (tree-sitter needs python3, make, g++)
# github-cli for Git Code Trainer Agent
RUN apk add --no-cache python3 py3-pip make g++ curl github-cli && \
    pip3 install --break-system-packages openai tqdm requests

# Install pnpm — use npm (corepack can be flaky in CI)
RUN npm install -g pnpm@9

WORKDIR /app

# ── Layer 1: Workspace config (changes rarely → cached) ──
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json turbo.json ./

# ── Layer 2: All package.json files (changes occasionally → cached) ──
# We need ALL workspace packages for pnpm to resolve workspace: links
COPY packages/memory-stack/package.json ./packages/memory-stack/
COPY packages/memory-stack/tsconfig.json ./packages/memory-stack/
COPY packages/domain-agents/package.json ./packages/domain-agents/
COPY packages/client/package.json ./packages/client/
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/slack-connector/package.json ./packages/slack-connector/

# Include platform/package.json so pnpm workspace resolution works
# (even though we don't build/run the platform in this image)
COPY platform/package.json ./platform/

# ── Layer 3: Install ALL dependencies (not --prod!) ──
# Scripts use tsx which needs TypeScript + type definitions at runtime.
# pnpm install with hoisted linker will create workspace symlinks.
RUN pnpm install --frozen-lockfile

# ── Layer 4: Copy source code ──
# Copy ONLY what the brain-orchestrator needs:
#   - packages/memory-stack/src (imported directly by scripts via tsx)
#   - scripts/ (the entry point + agent framework)
COPY packages/memory-stack/src ./packages/memory-stack/src
COPY packages/memory-stack/tsup.config.ts ./packages/memory-stack/

# Copy other packages that may be referenced
COPY packages/domain-agents/ ./packages/domain-agents/
COPY packages/client/ ./packages/client/
COPY packages/mcp-server/ ./packages/mcp-server/
COPY packages/slack-connector/ ./packages/slack-connector/

COPY scripts/ ./scripts/

# ── Layer 5: Build memory-stack (validates types + creates dist/) ──
# Some imports might reference dist/ in edge cases, so build it.
# If the build fails here, it's a real error — don't swallow it.
RUN cd packages/memory-stack && pnpm build

# Install tsx globally for runtime TypeScript execution
RUN npm install -g tsx

# ─────────────────────────────────────────────────────────────
# Stage 2: Production runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Runtime system dependencies
RUN apk add --no-cache curl python3 py3-pip github-cli && \
    pip3 install --break-system-packages openai tqdm requests

# Install pnpm + tsx globally (pnpm needed for `pnpm exec tsx` in docker-entrypoint.sh)
RUN npm install -g pnpm@9 tsx

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nexusbrain -u 1001 -G nodejs

WORKDIR /app

# Copy the entire built workspace from builder.
# This preserves:
#   - node_modules with correct hoisted symlinks
#   - packages/memory-stack/src (for tsx runtime imports)
#   - packages/memory-stack/dist (for any dist/ imports)
#   - scripts/ (entry point)
#   - workspace config files (for module resolution)
COPY --from=builder --chown=nexusbrain:nodejs /app ./

# Copy docker entrypoint script (routes BRAIN_PROCESS to correct agent)
COPY --chown=nexusbrain:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Set ownership
RUN chown -R nexusbrain:nodejs /app

USER nexusbrain

# Environment
ENV NODE_ENV=production
ENV PORT=3000
# AWS ECS Fargate: 4GB RAM per task (2048 CPU, 4096 MiB in task definition)
# Set Node.js heap to 3.5GB — leaves 512MB headroom for OS + native modules.
# Without this Node defaults to ~1.5GB and OOMs on large historical training runs.
ENV NODE_OPTIONS="--max-old-space-size=3584"

EXPOSE 3000

# Health check (only applies when running as orchestrator)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Entrypoint routes BRAIN_PROCESS env var to the correct agent script.
# Default: runs brain-orchestrator.ts (the central nervous system).
# Override BRAIN_PROCESS to run a specific agent:
#   docker run -e BRAIN_PROCESS=trainer nexusbrain
#   docker run -e BRAIN_PROCESS=consolidation nexusbrain
ENTRYPOINT ["./docker-entrypoint.sh"]

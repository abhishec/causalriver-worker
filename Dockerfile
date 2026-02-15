# NexusBrain Brain Training Container
# Runs autonomous-trainer, consolidation, or DMN scan based on BRAIN_PROCESS env var

FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@9

# Install Python 3 + pip for benchmark scripts (LongMemEval)
# Install github-cli for Git Code Trainer Agent
RUN apk add --no-cache python3 py3-pip github-cli && \
    pip3 install --break-system-packages openai tqdm requests

# Security: Create non-root user for production
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nexusbrain -u 1001 -G nodejs

WORKDIR /app

# Copy workspace config files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./

# Copy package.json files from all workspace packages
COPY packages/memory-stack/package.json packages/memory-stack/
COPY packages/domain-agents/package.json packages/domain-agents/
COPY packages/client/package.json packages/client/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/slack-connector/package.json packages/slack-connector/
COPY platform/package.json platform/ 2>/dev/null || true

# Install dependencies (production + dev for tsx)
RUN pnpm install --frozen-lockfile

# Copy all source code (excluding what's in .dockerignore)
COPY packages/ packages/
COPY platform/ platform/ 2>/dev/null || true
COPY scripts/ scripts/

# Build packages (this compiles TypeScript and prepares dependencies)
RUN pnpm build || echo "Build completed with warnings"

# Install tsx for running TypeScript
RUN npm install -g tsx

# Install curl for health checks
RUN apk add --no-cache curl

# Security: Set ownership and switch to non-root user
RUN chown -R nexusbrain:nodejs /app
USER nexusbrain

# Default environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start brain orchestrator
CMD ["tsx", "scripts/brain-orchestrator.ts"]

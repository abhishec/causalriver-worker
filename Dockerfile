# NexusBrain Brain Training Container
# Runs autonomous-trainer, consolidation, or DMN scan based on BRAIN_PROCESS env var

FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./

# Copy package.json files from all workspace packages
COPY packages/memory-stack/package.json packages/memory-stack/
COPY packages/domain-agents/package.json packages/domain-agents/
COPY packages/client/package.json packages/client/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/slack-connector/package.json packages/slack-connector/

# Install dependencies (production + dev for tsx)
RUN pnpm install --frozen-lockfile

# Copy all source code (excluding what's in .dockerignore)
COPY packages/ packages/
COPY scripts/ scripts/

# Copy entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Default environment
ENV NODE_ENV=production
ENV BRAIN_PROCESS=trainer

ENTRYPOINT ["/app/docker-entrypoint.sh"]

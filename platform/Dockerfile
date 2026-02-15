# Multi-stage build for Next.js platform on AWS ECS
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy all package.json files from workspace
COPY packages/memory-stack/package.json ./packages/memory-stack/
COPY platform/package.json ./platform/

# Install dependencies for entire workspace
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/memory-stack/node_modules ./packages/memory-stack/node_modules
COPY --from=deps /app/platform/node_modules ./platform/node_modules

# Copy source code
COPY packages/ ./packages/
COPY platform/ ./platform/
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./

# Build workspace packages first
WORKDIR /app/packages/memory-stack
RUN pnpm build

# Build the platform
WORKDIR /app/platform
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

RUN pnpm build

# Stage 3: Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/platform/public ./public
COPY --from=builder /app/platform/.next/standalone ./
COPY --from=builder /app/platform/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // ── Amplify SSR env var fix ──────────────────────────────────────────────────
  // AWS Amplify SSR Lambda does NOT pass Amplify Console env vars to the Node.js
  // runtime. NEXT_PUBLIC_* vars work because Next.js inlines them at build time,
  // but server-only vars (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY) are
  // missing at runtime. This `env` config inlines them into the server bundle
  // at build time so they're available regardless of Lambda runtime env.
  //
  // Security: These values are only embedded in server-side bundles (.next/server/)
  // and never exposed to the client, since they're only referenced in server files.
  env: {
    // Public Supabase vars — must be inlined for Amplify Lambda runtime
    // (requireEnv uses dynamic process.env[key] lookup, not Next.js static substitution)
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SE_AAS_WORKER_SECRET: process.env.SE_AAS_WORKER_SECRET,
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
    AWS_S3_REGION: process.env.AWS_S3_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    // Redis cache — falls back to in-memory if missing, but must be inlined for Lambda
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    // GitHub App connector
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    // Freshworks connector
    FRESHDESK_CLIENT_ID: process.env.FRESHDESK_CLIENT_ID,
    FRESHDESK_CLIENT_SECRET: process.env.FRESHDESK_CLIENT_SECRET,
    // Credential encryption key — set in Amplify Console, never hardcoded
    CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
  },

  // In dev: enable gzip (no CDN). In prod: disable (CloudFront handles it at edge).
  compress: isDev,

  // ── Cache headers for static assets ────────────────────────────────────────
  // _next/static/ files use content-hashed filenames → safe to cache forever.
  // CloudFront caches these at edge; browsers cache locally for 1 year.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  typescript: {
    // Types are validated locally via `tsc --noEmit` (pre-commit hook) and in CI.
    // The build-time type check is redundant and can fail due to Turbopack
    // timing issues with .next/types/validator.ts generation. Skip it here.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint runs in pre-commit hook (lint-staged) and CI.
    // Skipping during build saves ~30s and avoids false positives
    // from Turbopack-generated files.
    ignoreDuringBuilds: true,
  },
  // ── Dev server performance ──────────────────────────────────────────────────
  // Automatically tree-shake + barrel-file-optimize these heavy packages so
  // only the used exports are compiled instead of the entire library.
  experimental: {
    optimizePackageImports: [
      'recharts',
      'framer-motion',
      'shiki',
      '@supabase/supabase-js',
      'xlsx',
    ],
    // globalNotFound causes flaky build-trace failures in Next.js 15.5
    // (_not-found/page.js.nft.json missing). app/not-found.tsx works without it.
    // globalNotFound: true,
  },
  // Native Node.js modules — resolved at runtime, not bundled by webpack.
  // @nexus-ai/memory-stack is pre-built via tsup (dist/index.js) with tree-sitter
  // externalized; do NOT add it to transpilePackages or webpack will re-process
  // the source and try to bundle tree-sitter .node binaries for the browser.
  serverExternalPackages: [
    '@nexus-ai/memory-stack',
    'tree-sitter',
    'tree-sitter-go',
    'tree-sitter-java',
    'tree-sitter-python',
    'tree-sitter-scala',
  ],
  // Turbopack rule equivalent for .node files (used in `next dev --turbopack`).
  // Without this, Next.js warns "Webpack is configured while Turbopack is not".
  turbopack: {
    rules: {
      '*.node': {
        loaders: [path.resolve(__dirname, 'noop-loader.js')],
        as: '*.js',
      },
    },
  },
  webpack: (config) => {
    // Exclude .node native binary files from webpack compilation.
    // tree-sitter prebuilds contain platform-specific binaries that webpack
    // cannot process. They are loaded at runtime via node-gyp-build.
    config.module.rules.push({
      test: /\.node$/,
      type: 'javascript/auto',
      use: {
        loader: path.resolve(__dirname, 'noop-loader.js'),
      },
    });
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment (ECS/Fargate) and Amplify WEB_COMPUTE.
  // Only enable for production builds — causes webpack cache corruption in dev.
  ...(isDev ? {} : { output: 'standalone', outputFileTracingRoot: path.join(__dirname, '../') }),
  // In dev: enable gzip (no CDN). In prod: disable (CloudFront handles it at edge).
  compress: isDev,
  typescript: {
    // Skip type checking during build — monorepo workspace links
    // (e.g. @nexus-ai/memory-stack) don't resolve in Amplify CI.
    // Types are validated locally and in CI via `tsc --noEmit`.
    ignoreBuildErrors: true,
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

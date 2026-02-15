import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // SSR mode — NOT static export (platform needs API routes + middleware)
  // Note: Removed 'standalone' output - using Vercel's default SSR deployment
  typescript: {
    // Skip type checking during build — monorepo workspace links
    // (e.g. @nexus-ai/memory-stack) don't resolve in Amplify CI.
    // Types are validated locally and in CI via `tsc --noEmit`.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during CI builds — run separately via `pnpm lint`.
    ignoreDuringBuilds: true,
  },
  // Transpile workspace packages so Next.js resolves them correctly.
  // Required for Vercel monorepo deployments where pnpm workspace: links
  // must be resolved at build time.
  transpilePackages: ['@nexus-ai/memory-stack'],
  // Native Node.js modules — resolved at runtime, not bundled by webpack.
  serverExternalPackages: [
    'tree-sitter',
    'tree-sitter-go',
    'tree-sitter-python',
    'tree-sitter-scala',
  ],
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR mode — NOT static export (platform needs API routes + middleware)
  typescript: {
    // Skip type checking during build — monorepo workspace links
    // (e.g. @nexus-ai/memory-stack) don't resolve in Amplify CI.
    // Types are validated locally and in CI via `tsc --noEmit`.
    ignoreBuildErrors: true,
  },
  // Native Node.js modules — resolved at runtime, not bundled by webpack
  serverExternalPackages: [
    'tree-sitter',
    'tree-sitter-go',
    'tree-sitter-python',
    'tree-sitter-scala',
  ],
  outputFileTracingRoot: undefined,
  webpack: (config) => {
    // Handle native .node binary files (tree-sitter prebuilds)
    config.module.rules.push({
      test: /\.node$/,
      loader: 'node-loader',
    });
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR mode — NOT static export (platform needs API routes + middleware)
  typescript: {
    // Skip type checking during build — monorepo workspace links
    // (e.g. @nexus-ai/memory-stack) don't resolve in Amplify CI.
    // Types are validated locally and in CI via `tsc --noEmit`.
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    'tree-sitter',
    'tree-sitter-go',
    'tree-sitter-python',
    'tree-sitter-scala',
  ],
};

export default nextConfig;

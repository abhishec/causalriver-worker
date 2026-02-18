import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/causality/index.ts',
    'src/learning/index.ts',
    'src/core/embeddings/index.ts',
    'src/intelligence/index.ts',
    'src/hooks/index.ts',
    'src/benchmarks/index.ts',
    'src/persistence/index.ts',
    'src/code-indexing/index.ts',
  ],
  format: ['esm'],
  dts: true,
  // Disable sourcemaps in CI to avoid 20+ MB .map files that cause OOM.
  // Enable locally for debugging with: TSUP_SOURCEMAP=true pnpm build
  sourcemap: process.env.TSUP_SOURCEMAP === 'true',
  clean: true,
  splitting: true,
  treeshake: true,
  external: [
    'react',
    '@supabase/supabase-js',
    '@tanstack/react-query',
    'tree-sitter',
    'tree-sitter-go',
    'tree-sitter-java',
    'tree-sitter-python',
    'tree-sitter-scala',
    '@nexus-ai/slack-connector',
  ],
});

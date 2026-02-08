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
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ['react', '@supabase/supabase-js', '@tanstack/react-query'],
});

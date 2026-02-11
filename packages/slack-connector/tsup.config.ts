import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/fetcher/index.ts',
    'src/transform/index.ts',
    'src/analyzer/index.ts',
    'src/webhook/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: [
    '@slack/web-api',
    '@nexus-ai/memory-stack',
    '@supabase/supabase-js',
  ],
});

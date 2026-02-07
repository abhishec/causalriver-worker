import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/registry/index.ts',
    'src/intent/index.ts',
    'src/personas/index.ts',
    'src/routing/index.ts',
    'src/access/index.ts',
    'src/hooks/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ['react', '@supabase/supabase-js'],
});

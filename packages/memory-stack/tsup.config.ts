import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Post-build ESM compatibility patch.
 *
 * tsup/esbuild generates a __require shim that checks `typeof require !== "undefined"`.
 * In ESM contexts (Next.js Turbopack, Node ESM), `require` is undefined so the shim
 * throws "Dynamic require of X is not supported".
 *
 * This patch replaces the broken shim with `createRequire(import.meta.url)` from
 * node:module, which is the standard way to get CJS `require()` in ESM.
 *
 * It also adds __filename/__dirname polyfills for embedded TypeScript compiler code
 * that references `__filename` (which doesn't exist in ESM scope).
 */
function patchESMDist() {
  const distDir = join(process.cwd(), 'dist');

  // Patch 1: Replace __require shim in chunk files
  const BROKEN_SHIM = /var __require = \/\* @__PURE__ \*\/.*?throw Error\('Dynamic require of "' \+ x \+ '" is not supported'\);\s*\}\);/s;
  const CREATE_REQUIRE_IMPORT = 'import { createRequire as __createRequire } from "node:module";';
  const FIXED_SHIM = 'var __require = __createRequire(import.meta.url);';

  for (const file of readdirSync(distDir)) {
    if (!file.startsWith('chunk-') || !file.endsWith('.js')) continue;
    const filePath = join(distDir, file);
    const content = readFileSync(filePath, 'utf8');
    if (!BROKEN_SHIM.test(content)) continue;

    const patched = CREATE_REQUIRE_IMPORT + '\n' + content.replace(BROKEN_SHIM, FIXED_SHIM);
    writeFileSync(filePath, patched, 'utf8');
  }

  // Patch 2: Add __filename/__dirname polyfills to index.js
  const indexPath = join(distDir, 'index.js');
  try {
    const indexContent = readFileSync(indexPath, 'utf8');
    if (!indexContent.includes('__fileURLToPath')) {
      const polyfill = [
        'import { fileURLToPath as __fileURLToPath } from "node:url";',
        'import { dirname as __pathDirname } from "node:path";',
        'var __filename = __fileURLToPath(import.meta.url);',
        'var __dirname = __pathDirname(__filename);',
      ].join('\n');
      writeFileSync(indexPath, polyfill + '\n' + indexContent, 'utf8');
    }
  } catch { /* index.js may not exist in partial builds */ }
}

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
  onSuccess: async () => {
    patchESMDist();
  },
});

import { defineConfig } from 'tsup';

export default defineConfig([
  // Main MCP server binary (with shebang)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: process.env.TSUP_SOURCEMAP === 'true',
    clean: true,
    minify: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Handler exports (no shebang — library modules)
  {
    entry: [
      'src/handlers.ts',
      'src/jarvis-handlers.ts',
      'src/jira-client.ts',
    ],
    format: ['esm'],
    dts: true,
    sourcemap: process.env.TSUP_SOURCEMAP === 'true',
    clean: false,
    minify: false,
  },
]);

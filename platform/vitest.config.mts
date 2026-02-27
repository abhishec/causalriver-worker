import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "..");

// Use the root monorepo copies so @testing-library/react, react-dom, and our
// component code all share a single React instance.
const reactPath = path.resolve(monorepoRoot, "node_modules/react");
const reactDomPath = path.resolve(monorepoRoot, "node_modules/react-dom");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    css: false,
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      // Coverage is scoped to pure, unit-testable lib files only.
      // Server-side files (Supabase, Redis, AWS, Anthropic) require integration
      // tests and are explicitly excluded — they cannot be meaningfully covered
      // without a live DB/API connection.
      include: [
        // Pure utility functions
        "lib/utils.ts",
        "lib/safe-json.ts",
        // Parsers (no I/O)
        "lib/parsers/gl-file-parser.ts",
        // Model routers (pure input→output)
        "lib/brain/model-router.ts",
        "lib/se-aas/model-router.ts",
        // Domain routing (pure logic)
        "lib/copilot/domain-router.ts",
        "lib/copilot/stream-utils.ts",
        // SE-aaS catalogue (pure domain registry)
        "lib/se-aas/domain-catalogue.ts",
        // RL quality scoring (pure heuristic)
        "lib/brain/agent-rl.ts",
        // Rate limiter utilities (pure hashing + headers)
        "lib/rate-limiter.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 80,
        statements: 95,
      },
    },
    server: {
      deps: {
        // Force these into the same module graph so React deduplicates
        inline: [/react/, /react-dom/, /@testing-library/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      react: reactPath,
      "react/jsx-runtime": path.resolve(reactPath, "jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(reactPath, "jsx-dev-runtime.js"),
      "react-dom": reactDomPath,
      "react-dom/client": path.resolve(reactDomPath, "client.js"),
    },
  },
});

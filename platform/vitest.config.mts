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
      include: [
        "lib/**/*.ts",
        "lib/**/*.tsx",
      ],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
        "lib/supabase/**",     // server-side clients need DB
        "lib/redis.ts",        // needs Redis connection
        "lib/env.ts",          // env var bootstrapping
        "lib/error-tracker-init.tsx", // Sentry init
      ],
      // Thresholds are intentionally low because most lib/ files are server-side
      // (Supabase, Redis, AWS) and can only be covered by integration/e2e tests.
      // Per-file coverage for tested modules (utils, rate-limiter, agent-rl, parsers)
      // is tracked via the text reporter output.
      thresholds: {
        lines: 2,
        functions: 5,
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

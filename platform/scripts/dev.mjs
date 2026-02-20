#!/usr/bin/env node

/**
 * Brain OS — Smart Dev Server Orchestrator
 * ═════════════════════════════════════════
 *
 * Wraps `next dev --turbopack` with:
 *   1. Kill stale processes on port 3001
 *   2. Smart .next cache corruption detection + cleanup
 *   3. Env validation (checks .env.local before starting)
 *   4. Auto-restart on crash (with backoff, max 5/minute)
 *   5. Pre-warm critical routes after startup
 *   6. Colored terminal output with timestamps
 *
 * Usage:
 *   node scripts/dev.mjs          # normal start
 *   node scripts/dev.mjs --clean  # force cache clear + start
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOT_NEXT = resolve(ROOT, ".next");
const PORT = 3001;

/* ── Color helpers (zero deps) ────────────────────────────────────── */

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m",
};

function log(prefix, color, msg) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`${c.dim}${ts}${c.reset} ${color}${prefix}${c.reset} ${msg}`);
}

const info = (msg) => log("  [dev]", c.cyan, msg);
const ok = (msg) => log("   [ok]", c.green, msg);
const warn = (msg) => log(" [warn]", c.yellow, msg);
const err = (msg) => log("  [err]", c.red, msg);

/* ── Step 1: Kill stale port processes ────────────────────────────── */

function killPort(port) {
  try {
    const result = execSync(`lsof -ti:${port}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (result) {
      const pids = result.split("\n").filter(Boolean);
      info(`Killing ${pids.length} stale process(es) on port ${port}`);
      execSync(`kill -9 ${pids.join(" ")}`, { stdio: "ignore" });
      ok(`Port ${port} freed`);
    }
  } catch {
    // No process on port — that's fine
  }
}

/* ── Step 2: Cache corruption detection ───────────────────────────── */

function checkAndCleanCache() {
  if (!existsSync(DOT_NEXT)) {
    ok("No .next cache (clean start)");
    return;
  }

  let shouldClean = false;
  const reasons = [];

  // Check 1: --clean flag
  if (process.argv.includes("--clean")) {
    reasons.push("--clean flag");
    shouldClean = true;
  }

  // Check 2: trace file is 0 bytes (corruption marker)
  const traceFile = resolve(DOT_NEXT, "trace");
  if (existsSync(traceFile)) {
    try {
      if (statSync(traceFile).size === 0) {
        reasons.push("corrupt trace file (0 bytes)");
        shouldClean = true;
      }
    } catch { /* ignore */ }
  }

  // Check 3: cache older than 7 days
  try {
    const stat = statSync(DOT_NEXT);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      reasons.push(`stale cache (${Math.floor(ageDays)} days old)`);
      shouldClean = true;
    }
  } catch { /* ignore */ }

  if (shouldClean) {
    warn(`Cleaning .next: ${reasons.join(", ")}`);
    rmSync(DOT_NEXT, { recursive: true, force: true });
    ok("Cache cleared");
  } else {
    ok(".next cache looks healthy");
  }
}

/* ── Step 3: Env validation ───────────────────────────────────────── */

function validateEnv() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    err(".env.local not found!");
    err("Create it with your Supabase + Anthropic credentials");
    process.exit(1);
  }

  const content = readFileSync(envPath, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }

  const REQUIRED = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
  ];

  const placeholders = ["your-", "xxx", "...", "TODO", "REPLACE"];
  const missing = REQUIRED.filter((k) => {
    const v = vars[k];
    if (!v) return true;
    return placeholders.some((p) => v.toLowerCase().includes(p.toLowerCase()));
  });

  if (missing.length > 0) {
    err("Missing or placeholder env vars:");
    missing.forEach((k) => console.log(`  ${c.red}✗${c.reset} ${k}`));
    err("Update .env.local before starting");
    process.exit(1);
  }
  ok(`Env validated (${REQUIRED.length} required vars present)`);
}

/* ── Step 4: Pre-warm routes ──────────────────────────────────────── */

async function prewarm() {
  const routes = ["/login", "/api/health", "/copilot", "/overview"];
  info("Pre-warming critical routes...");
  for (const route of routes) {
    try {
      const res = await fetch(`http://localhost:${PORT}${route}`, {
        redirect: "manual",
      });
      ok(`Warmed ${route} (${res.status})`);
    } catch {
      // Server may still be compiling, that's fine
    }
  }
}

/* ── Step 5: Start Next.js with auto-restart ──────────────────────── */

function startDev() {
  let restartTimestamps = [];
  const MAX_RESTARTS = 5;
  const RESTART_WINDOW = 60_000;
  let currentChild = null;

  function launch() {
    info(`Starting Next.js on port ${PORT} with Turbopack...`);
    console.log("");

    const child = spawn(
      "npx",
      ["next", "dev", "--port", String(PORT), "--turbopack"],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development" },
      }
    );
    currentChild = child;

    child.on("exit", (code, signal) => {
      if (signal === "SIGINT" || signal === "SIGTERM") {
        // User pressed Ctrl+C — clean exit
        process.exit(0);
      }

      // Crash detected
      const now = Date.now();
      restartTimestamps.push(now);
      restartTimestamps = restartTimestamps.filter(
        (t) => now - t < RESTART_WINDOW
      );

      if (restartTimestamps.length >= MAX_RESTARTS) {
        console.log("");
        err(
          `Server crashed ${MAX_RESTARTS} times in 1 minute — stopping`
        );
        err("Fix the error above, then run: pnpm dev");
        process.exit(1);
      }

      console.log("");
      warn(
        `Server exited (code=${code}). Restarting in 2s... ` +
          `(${restartTimestamps.length}/${MAX_RESTARTS} crashes)`
      );
      setTimeout(launch, 2000);
    });

    // Pre-warm after server is likely ready
    setTimeout(() => prewarm(), 10_000);
  }

  // Forward signals for clean shutdown
  process.on("SIGINT", () => {
    currentChild?.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    currentChild?.kill("SIGTERM");
  });

  launch();
}

/* ── Main ─────────────────────────────────────────────────────────── */

console.log(
  `\n${c.bold}${c.magenta}  ✦ Brain OS${c.reset}${c.dim} — Dev Server${c.reset}\n`
);

killPort(PORT);
checkAndCleanCache();
validateEnv();
startDev();

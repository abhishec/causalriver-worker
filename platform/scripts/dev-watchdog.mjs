#!/usr/bin/env node
/**
 * Dev Watchdog v2 — health + memory monitor for `next dev`
 *
 * What it does:
 * 1. Cleans .next cache on every start (prevents stale compilation)
 * 2. Kills ANY stale process on port 3001 before starting
 * 3. Starts `next dev --port 3001 --turbopack` (direct binary, no npx wrapper)
 * 4. Pings localhost:3001/api/health every 30s
 * 5. Monitors memory — if node RSS exceeds 1.5 GB, auto-restarts BEFORE it zombies
 * 6. If 3 consecutive health pings fail (server hung), auto-restarts
 * 7. Forwards Ctrl+C cleanly
 *
 * ALWAYS start with: pnpm dev  (routes through this watchdog)
 * NEVER run: next dev --port 3001  (bypasses the watchdog)
 */

import { spawn, execSync } from "child_process";
import { rmSync, existsSync, readFileSync } from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = path.resolve(__dirname, "..");
const MONOREPO_ROOT = path.resolve(PLATFORM_DIR, "..");
const PORT = 3001;
const HEALTH_INTERVAL = 30_000; // Check every 30s
const MAX_FAILURES = 3; // Restart after 3 consecutive failures
const STARTUP_GRACE = 25_000; // Wait 25s before first health check
const MAX_RSS_MB = 1500; // Restart if Node RSS exceeds 1.5 GB
const RESTART_COOLDOWN = 4000; // Wait 4s between restarts to let port free

// Resolve the next binary — use the monorepo hoisted one directly
// This avoids the npx wrapper which exits prematurely (code 0) leaving orphan processes
const NEXT_BIN = (() => {
  const platformBin = path.join(PLATFORM_DIR, "node_modules", ".bin", "next");
  const rootBin = path.join(MONOREPO_ROOT, "node_modules", ".bin", "next");
  if (existsSync(platformBin)) return platformBin;
  if (existsSync(rootBin)) return rootBin;
  // Fallback — let PATH resolve it
  return "next";
})();

let child = null;
let healthTimer = null;
let failures = 0;
let restarting = false;
let shuttingDown = false;
let restartCount = 0;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[36m[watchdog ${ts}]\x1b[0m ${msg}`);
}

function logWarn(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[33m[watchdog ${ts}]\x1b[0m ⚠ ${msg}`);
}

function logError(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[31m[watchdog ${ts}]\x1b[0m ✖ ${msg}`);
}

function logSuccess(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[32m[watchdog ${ts}]\x1b[0m ✓ ${msg}`);
}

function cleanCache() {
  const nextDir = path.join(PLATFORM_DIR, ".next");
  if (existsSync(nextDir)) {
    log("Cleaning .next cache...");
    rmSync(nextDir, { recursive: true, force: true });
  }
}

function killPort() {
  try {
    const pids = execSync(`lsof -ti:${PORT} 2>/dev/null`, { encoding: "utf8" }).trim();
    if (pids) {
      const myPid = process.pid;
      for (const pid of pids.split("\n")) {
        const pidNum = Number(pid);
        // Don't kill ourselves
        if (pidNum && pidNum !== myPid) {
          try { process.kill(pidNum, "SIGKILL"); } catch {}
        }
      }
      log(`Killed stale process(es) on port ${PORT}`);
    }
  } catch {}
}

/**
 * Get the RSS (Resident Set Size) of the next-server child process tree in MB.
 * Returns 0 if we can't measure it.
 */
function getChildRssMb() {
  if (!child || !child.pid) return 0;
  try {
    // Get RSS of child and all its descendants
    const output = execSync(
      `ps -o rss= -p ${child.pid} 2>/dev/null; pgrep -P ${child.pid} 2>/dev/null | xargs -I{} ps -o rss= -p {} 2>/dev/null`,
      { encoding: "utf8", timeout: 3000 }
    ).trim();
    if (!output) return 0;
    // Sum all RSS values (in KB), convert to MB
    const totalKb = output.split("\n").reduce((sum, line) => {
      const kb = parseInt(line.trim(), 10);
      return sum + (isNaN(kb) ? 0 : kb);
    }, 0);
    return Math.round(totalKb / 1024);
  } catch {
    return 0;
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/api/health`, { timeout: 5000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  if (shuttingDown) return;

  killPort();

  // Only clean cache on first start or after unresponsive restarts (not on clean exits)
  if (restartCount === 0) {
    cleanCache();
  }

  const isRestart = restartCount > 0;
  if (!isRestart) {
    console.log("");
    console.log("\x1b[36m" + "╔══════════════════════════════════════════════════════════╗");
    console.log("║               🐕 BrainOS Dev Watchdog v2                ║");
    console.log("║                                                          ║");
    console.log("║   Health checks every 30s · Memory limit 1.5 GB         ║");
    console.log("║   Auto-restart on zombie · Clean shutdown on Ctrl+C      ║");
    console.log("║                                                          ║");
    console.log("║   ⚡ Always start with: pnpm dev                        ║");
    console.log("║   🚫 Never run bare: next dev                           ║");
    console.log("╚══════════════════════════════════════════════════════════╝" + "\x1b[0m");
    console.log("");
  } else {
    log(`Restarting server (restart #${restartCount})...`);
  }

  log(`Starting: ${NEXT_BIN} dev --port ${PORT} --turbopack`);

  // Spawn the next binary directly — NOT through npx which creates a wrapper
  // process that exits (code 0) while leaving the actual server orphaned.
  child = spawn(NEXT_BIN, ["dev", "--port", String(PORT), "--turbopack"], {
    cwd: PLATFORM_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("error", (err) => {
    logError(`Failed to start server: ${err.message}`);
    if (!shuttingDown) {
      restartCount++;
      setTimeout(startServer, RESTART_COOLDOWN);
    }
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (shuttingDown || restarting) return;

    // If it was killed by a signal (SIGKILL/SIGTERM), that's expected during restart
    if (signal) {
      log(`Server killed by signal ${signal}`);
      return;
    }

    // Non-zero exit = crash, restart
    if (code !== 0) {
      logWarn(`Server crashed with code ${code}, restarting in ${RESTART_COOLDOWN / 1000}s...`);
      restartCount++;
      setTimeout(startServer, RESTART_COOLDOWN);
      return;
    }

    // Exit code 0 = clean shutdown. DON'T auto-restart.
    // This happens when the user presses Ctrl+C in the next dev terminal,
    // or when something calls process.exit(0). Restarting would cause a storm.
    log("Server exited cleanly (code 0). Not restarting. Run `pnpm dev` to start again.");
  });

  // Start health checks after grace period
  failures = 0;
  clearInterval(healthTimer);
  setTimeout(() => {
    if (shuttingDown) return;
    logSuccess(`Health monitoring active (every ${HEALTH_INTERVAL / 1000}s)`);

    healthTimer = setInterval(async () => {
      if (shuttingDown || restarting) return;

      // 1. Memory check
      const rssMb = getChildRssMb();
      if (rssMb > MAX_RSS_MB) {
        logError(`Memory limit exceeded: ${rssMb} MB > ${MAX_RSS_MB} MB — restarting before zombie`);
        return triggerRestart("memory");
      }

      // 2. Health check
      const ok = await healthCheck();
      if (ok) {
        if (failures > 0) logSuccess(`Server recovered (RSS: ${rssMb} MB)`);
        failures = 0;
      } else {
        failures++;
        logWarn(`Health check failed (${failures}/${MAX_FAILURES}) — RSS: ${rssMb} MB`);
        if (failures >= MAX_FAILURES) {
          logError(`Server unresponsive for ${MAX_FAILURES * HEALTH_INTERVAL / 1000}s — auto-restarting`);
          return triggerRestart("unresponsive");
        }
      }
    }, HEALTH_INTERVAL);
  }, STARTUP_GRACE);
}

function triggerRestart(reason) {
  restarting = true;
  restartCount++;
  clearInterval(healthTimer);

  // Clean cache on unresponsive restarts (likely corrupted state)
  if (reason === "unresponsive" || reason === "memory") {
    cleanCache();
  }

  if (child) {
    try { child.kill("SIGKILL"); } catch {}
    child = null;
  }

  log(`Restart triggered (reason: ${reason}) — cooling down ${RESTART_COOLDOWN / 1000}s...`);
  setTimeout(() => {
    restarting = false;
    startServer();
  }, RESTART_COOLDOWN);
}

// Clean shutdown on Ctrl+C
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(""); // New line after ^C
  log("Shutting down gracefully...");
  clearInterval(healthTimer);
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child) {
        try { child.kill("SIGKILL"); } catch {}
      }
      process.exit(0);
    }, 3000);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Preflight checks ──────────────────────────────────────────────────────
// Validate environment BEFORE starting the server. Catches misconfig early
// instead of letting you wait 30s for a cryptic runtime error.

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
];

const PLACEHOLDER_PATTERNS = [/^your-/i, /^xxx/i, /^\.\.\./, /^todo/i, /^replace/i, /^changeme/i];

function preflight() {
  const checks = [];

  // 1. Node version
  const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeVersion < 20) {
    checks.push({ ok: false, label: `Node.js v${process.versions.node} (need >= 20)` });
  } else {
    checks.push({ ok: true, label: `Node.js v${process.versions.node}` });
  }

  // 2. .env.local exists
  const envPath = path.join(PLATFORM_DIR, ".env.local");
  if (!existsSync(envPath)) {
    console.log("");
    logError(".env.local not found!");
    logError("Create it from the example:");
    logError("  cp platform/.env.example platform/.env.local");
    logError("Then fill in your Supabase and Anthropic credentials.");
    console.log("");
    process.exit(1);
  }
  checks.push({ ok: true, label: ".env.local found" });

  // 3. Parse and validate env vars
  const envContent = readFileSync(envPath, "utf8");
  const envVars = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }

  const missingVars = [];
  const placeholderVars = [];
  for (const key of REQUIRED_ENV_VARS) {
    const val = envVars[key] || process.env[key];
    if (!val) {
      missingVars.push(key);
    } else if (PLACEHOLDER_PATTERNS.some((p) => p.test(val))) {
      placeholderVars.push(key);
    }
  }

  if (missingVars.length > 0 || placeholderVars.length > 0) {
    const total = missingVars.length + placeholderVars.length;
    checks.push({
      ok: false,
      label: `${REQUIRED_ENV_VARS.length - total}/${REQUIRED_ENV_VARS.length} required env vars valid`,
    });
    if (missingVars.length) logError(`  Missing: ${missingVars.join(", ")}`);
    if (placeholderVars.length) logError(`  Placeholder values: ${placeholderVars.join(", ")}`);
  } else {
    checks.push({ ok: true, label: `${REQUIRED_ENV_VARS.length}/${REQUIRED_ENV_VARS.length} required env vars present` });
  }

  // 4. Port availability
  try {
    const pids = execSync(`lsof -ti:${PORT} 2>/dev/null`, { encoding: "utf8" }).trim();
    if (pids) {
      const pidList = pids.split("\n").filter((p) => Number(p) !== process.pid);
      if (pidList.length > 0) {
        checks.push({ ok: false, label: `Port ${PORT} in use by PID ${pidList.join(", ")} (will kill)` });
      } else {
        checks.push({ ok: true, label: `Port ${PORT} is free` });
      }
    } else {
      checks.push({ ok: true, label: `Port ${PORT} is free` });
    }
  } catch {
    checks.push({ ok: true, label: `Port ${PORT} is free` });
  }

  // Print summary
  console.log("");
  log("Preflight checks:");
  for (const c of checks) {
    const icon = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✖\x1b[0m";
    console.log(`  ${icon} ${c.label}`);
  }
  console.log("");

  // Fatal: missing env vars should stop (placeholder is a warning, not fatal)
  if (missingVars.length > 0) {
    logError("Cannot start — fix the missing env vars above, then run pnpm dev again.");
    process.exit(1);
  }

  // 5. Inject .env.local values into process.env for vars that are empty or missing.
  // Why: Tools like Claude Code set ANTHROPIC_API_KEY="" in the shell environment.
  // Next.js / dotenv won't overwrite existing env vars (even empty ones), so the
  // empty shell value shadows the real .env.local value. We fix this by explicitly
  // setting process.env from the parsed file for any required var that's empty.
  for (const key of REQUIRED_ENV_VARS) {
    if (envVars[key] && (!process.env[key] || process.env[key].trim() === "")) {
      process.env[key] = envVars[key];
      log(`Injected ${key} from .env.local (was empty in shell env)`);
    }
  }
}

// Go
preflight();
startServer();

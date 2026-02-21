#!/usr/bin/env node
/**
 * Dev Watchdog — lightweight health monitor for `next dev`
 *
 * What it does:
 * 1. Cleans .next cache on every start (prevents stale compilation)
 * 2. Starts `next dev --port 3001 --turbopack`
 * 3. Pings localhost:3001 every 30s after the server is ready
 * 4. If 3 consecutive pings fail (server hung), auto-restarts
 * 5. Forwards Ctrl+C cleanly
 *
 * This is NOT the old heavy orchestrator. No port-kill loops, no pre-warming,
 * no restart cascades. Just a simple watchdog.
 */

import { spawn, execSync } from "child_process";
import { rmSync, existsSync } from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = path.resolve(__dirname, "..");
const PORT = 3001;
const HEALTH_INTERVAL = 30_000; // Check every 30s
const MAX_FAILURES = 3; // Restart after 3 consecutive failures
const STARTUP_GRACE = 20_000; // Wait 20s before first health check

let child = null;
let healthTimer = null;
let failures = 0;
let restarting = false;
let shuttingDown = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[36m[watchdog ${ts}]\x1b[0m ${msg}`);
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
      for (const pid of pids.split("\n")) {
        try { process.kill(Number(pid), "SIGKILL"); } catch {}
      }
      log(`Killed stale process(es) on port ${PORT}`);
    }
  } catch {}
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
  cleanCache();

  log("Starting next dev --port 3001 --turbopack");
  child = spawn("npx", ["next", "dev", "--port", String(PORT), "--turbopack"], {
    cwd: PLATFORM_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("exit", (code) => {
    if (!shuttingDown && !restarting) {
      log(`Server exited with code ${code}, restarting...`);
      setTimeout(startServer, 2000);
    }
  });

  // Start health checks after grace period
  failures = 0;
  clearInterval(healthTimer);
  setTimeout(() => {
    healthTimer = setInterval(async () => {
      if (shuttingDown || restarting) return;
      const ok = await healthCheck();
      if (ok) {
        if (failures > 0) log("Server recovered ✓");
        failures = 0;
      } else {
        failures++;
        log(`Health check failed (${failures}/${MAX_FAILURES})`);
        if (failures >= MAX_FAILURES) {
          log("Server unresponsive — auto-restarting...");
          restarting = true;
          clearInterval(healthTimer);
          if (child) {
            child.kill("SIGKILL");
            child = null;
          }
          setTimeout(() => {
            restarting = false;
            startServer();
          }, 2000);
        }
      }
    }, HEALTH_INTERVAL);
  }, STARTUP_GRACE);
}

// Clean shutdown on Ctrl+C
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down...");
  clearInterval(healthTimer);
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child) child.kill("SIGKILL");
      process.exit(0);
    }, 3000);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Go
log("Dev watchdog starting...");
startServer();

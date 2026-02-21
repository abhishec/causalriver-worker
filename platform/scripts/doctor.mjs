#!/usr/bin/env node
/**
 * BrainOS Doctor — one-command diagnostic for your dev environment.
 *
 * Checks: Node version, pnpm version, .env.local, env vars, port 3001,
 *         Supabase connectivity, .next cache health, TypeScript, disk space.
 *
 * Usage:
 *   pnpm doctor       (from monorepo root)
 *   node scripts/doctor.mjs   (from platform/)
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, statSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = path.resolve(__dirname, "..");
const MONOREPO_ROOT = path.resolve(PLATFORM_DIR, "..");

const PORT = 3001;

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
];

const OPTIONAL_ENV = [
  "AWS_S3_BUCKET_NAME",
  "AWS_S3_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

const PLACEHOLDER_PATTERNS = [/^your-/i, /^xxx/i, /^\.\.\./, /^todo/i, /^replace/i, /^changeme/i];

// ─── Colors ─────────────────────────────────────────────────────────────────

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// ─── Results tracking ───────────────────────────────────────────────────────

const results = [];
const issues = [];

function ok(label) {
  results.push({ ok: true, label });
}

function fail(label) {
  results.push({ ok: false, label });
  issues.push(label);
}

function warn(label) {
  results.push({ ok: "warn", label });
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 20) {
    fail(`Node.js v${process.versions.node} — need >= 20`);
  } else {
    ok(`Node.js v${process.versions.node}`);
  }
}

function checkPnpmVersion() {
  try {
    const version = execSync("pnpm --version", { encoding: "utf8", timeout: 5000 }).trim();
    const major = parseInt(version.split(".")[0], 10);
    if (major < 9) {
      fail(`pnpm ${version} — need >= 9`);
    } else {
      ok(`pnpm ${version}`);
    }
  } catch {
    fail("pnpm not found — install with: npm install -g pnpm");
  }
}

function checkEnvFile() {
  const envPath = path.join(PLATFORM_DIR, ".env.local");
  if (!existsSync(envPath)) {
    fail(".env.local not found — cp .env.example .env.local");
    return null;
  }
  ok(".env.local found");

  // Parse env vars
  const content = readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function checkRequiredEnvVars(vars) {
  if (!vars) return;

  let missing = 0;
  let placeholder = 0;
  for (const key of REQUIRED_ENV) {
    const val = vars[key] || process.env[key];
    if (!val) {
      missing++;
      fail(`${key} — not set`);
    } else if (PLACEHOLDER_PATTERNS.some((p) => p.test(val))) {
      placeholder++;
      fail(`${key} — contains placeholder value`);
    }
  }
  if (missing === 0 && placeholder === 0) {
    ok(`${REQUIRED_ENV.length}/${REQUIRED_ENV.length} required env vars present`);
  }

  // Optional vars (just info, no fail)
  for (const key of OPTIONAL_ENV) {
    const val = vars[key] || process.env[key];
    if (!val) {
      warn(`${key} — not set (optional)`);
    }
  }
}

function checkPort() {
  try {
    const pids = execSync(`lsof -ti:${PORT} 2>/dev/null`, { encoding: "utf8", timeout: 3000 }).trim();
    if (pids) {
      const pidList = pids.split("\n").filter(Boolean);
      warn(`Port ${PORT} in use by PID ${pidList.join(", ")}`);
    } else {
      ok(`Port ${PORT} is free`);
    }
  } catch {
    ok(`Port ${PORT} is free`);
  }
}

async function checkSupabase(vars) {
  if (!vars) return;

  const url = vars["NEXT_PUBLIC_SUPABASE_URL"] || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    fail("Supabase — cannot check (missing URL or anon key)");
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const start = Date.now();

    const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latency = Date.now() - start;
    if (res.ok || res.status === 404) {
      ok(`Supabase reachable (${latency}ms)`);
    } else {
      fail(`Supabase returned HTTP ${res.status} (${latency}ms)`);
    }
  } catch (err) {
    fail(`Supabase unreachable — ${err.message}`);
  }
}

function checkNextCache() {
  const nextDir = path.join(PLATFORM_DIR, ".next");
  if (!existsSync(nextDir)) {
    warn(".next cache — not found (will be created on first dev/build)");
    return;
  }

  try {
    const stat = statSync(nextDir);
    const ageHours = Math.round((Date.now() - stat.mtimeMs) / (1000 * 60 * 60));

    // Check for corruption: trace file of 0 bytes
    const tracePath = path.join(nextDir, "trace");
    if (existsSync(tracePath) && statSync(tracePath).size === 0) {
      fail(".next cache — corrupted (0-byte trace file). Run: rm -rf platform/.next");
      return;
    }

    // Estimate size
    let sizeMb = 0;
    try {
      const output = execSync(`du -sm "${nextDir}" 2>/dev/null`, { encoding: "utf8", timeout: 5000 });
      sizeMb = parseInt(output.split("\t")[0], 10) || 0;
    } catch {
      sizeMb = 0;
    }

    ok(`.next cache healthy (${sizeMb} MB, ${ageHours}h old)`);
  } catch {
    warn(".next cache — could not inspect");
  }
}

function checkTypeScript() {
  try {
    const start = Date.now();
    execSync("pnpm exec tsc --noEmit", {
      cwd: PLATFORM_DIR,
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe",
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    ok(`TypeScript compiles cleanly (${elapsed}s)`);
  } catch (err) {
    const lines = (err.stdout || err.stderr || "").split("\n").filter(Boolean);
    const errorCount = lines.filter((l) => l.includes("error TS")).length;
    fail(`TypeScript — ${errorCount || "unknown number of"} error(s)`);
  }
}

function checkDiskSpace() {
  try {
    const output = execSync(`df -g "${PLATFORM_DIR}" 2>/dev/null`, { encoding: "utf8", timeout: 3000 });
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const availGb = parseInt(parts[3], 10);
      if (isNaN(availGb)) {
        warn("Disk space — could not determine");
      } else if (availGb < 1) {
        fail(`Disk space — only ${availGb} GB free (need >= 1 GB for .next cache)`);
      } else {
        ok(`Disk space: ${availGb} GB free`);
      }
    }
  } catch {
    warn("Disk space — could not determine");
  }
}

function checkNodeModules() {
  const nmDir = path.join(PLATFORM_DIR, "node_modules");
  if (!existsSync(nmDir)) {
    fail("node_modules not found — run: pnpm install");
  } else {
    ok("node_modules present");
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(cyan("  🧠 BrainOS Doctor"));
  console.log(cyan("  ═════════════════"));
  console.log("");

  // Runtime
  console.log(bold("  Runtime"));
  checkNodeVersion();
  checkPnpmVersion();
  printSection();

  // Environment
  console.log(bold("  Environment"));
  const envVars = checkEnvFile();
  checkRequiredEnvVars(envVars);
  printSection();

  // Network
  console.log(bold("  Network"));
  checkPort();
  await checkSupabase(envVars);
  printSection();

  // Build
  console.log(bold("  Build"));
  checkNodeModules();
  checkNextCache();
  checkDiskSpace();
  console.log(dim("    Running TypeScript check..."));
  checkTypeScript();
  // Clear the "Running" line and reprint
  printSection();

  // Summary
  const passed = results.filter((r) => r.ok === true).length;
  const warned = results.filter((r) => r.ok === "warn").length;
  const failed = results.filter((r) => r.ok === false).length;
  const total = passed + failed;

  console.log("");
  if (failed === 0) {
    console.log(green(bold(`  ✓ All ${total} checks passed`)) + (warned > 0 ? yellow(` (${warned} warnings)`) : ""));
  } else {
    console.log(red(bold(`  ✖ ${passed}/${total} checks passed, ${failed} issue(s) found:`)));
    for (const issue of issues) {
      console.log(red(`    ✖ ${issue}`));
    }
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

function printSection() {
  // Print accumulated results for the current section, then clear
  for (const r of results.filter((r) => !r._printed)) {
    const icon =
      r.ok === true
        ? green("✓")
        : r.ok === "warn"
          ? yellow("─")
          : red("✖");
    console.log(`    ${icon} ${r.label}`);
    r._printed = true;
  }
  console.log("");
}

main().catch((err) => {
  console.error("Doctor failed:", err);
  process.exit(1);
});

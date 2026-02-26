#!/usr/bin/env npx tsx
// Pre-demo health check — run before Tookitaki demo
// Usage: cd platform && npx tsx scripts/pre-demo-health-check.ts

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROD_BASE = "https://platform.usebrainos.com";

const results: { name: string; passed: boolean; detail: string }[] = [];

async function check(name: string, fn: () => Promise<{ passed: boolean; detail: string }>) {
  process.stdout.write(`  Checking: ${name} ... `);
  try {
    const result = await fn();
    const icon = result.passed ? "PASS" : "FAIL";
    console.log(`[${icon}] ${result.detail}`);
    results.push({ name, passed: result.passed, detail: result.detail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[FAIL] Error: ${msg}`);
    results.push({ name, passed: false, detail: `Error: ${msg}` });
  }
}

async function main() {
  console.log("\n========================================");
  console.log("  BrainOS Pre-Demo Health Check");
  console.log("  Demo: Tookitaki — 2026-02-27 11:00 SGT");
  console.log("========================================\n");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.\n");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Production URL reachable
  await check("Production URL reachable", async () => {
    const res = await fetch(`${PROD_BASE}/api/brain/health`);
    const text = await res.text();
    if (res.status === 200) {
      return { passed: true, detail: `HTTP 200 — ${text.slice(0, 80)}` };
    }
    return { passed: false, detail: `HTTP ${res.status} — ${text.slice(0, 80)}` };
  });

  // 2. RL status API
  await check("RL status API (learningVelocity, totalSignals24h)", async () => {
    const res = await fetch(`${PROD_BASE}/api/brain/rl-status`);
    if (res.status === 401 || res.status === 403) {
      // Requires auth — confirm it is reachable (not 404/500)
      return { passed: true, detail: `HTTP ${res.status} (auth required — endpoint exists)` };
    }
    if (res.status !== 200) {
      return { passed: false, detail: `HTTP ${res.status}` };
    }
    const json = await res.json();
    const hasVelocity = "learningVelocity" in json;
    const hasSignals = "totalSignals24h" in json;
    if (hasVelocity && hasSignals) {
      return {
        passed: true,
        detail: `learningVelocity=${json.learningVelocity}, totalSignals24h=${json.totalSignals24h}`,
      };
    }
    return { passed: false, detail: `Missing fields. Keys: ${Object.keys(json).join(", ")}` };
  });

  // 3. Engagements table — count >= 1
  await check("Delivery intelligence — engagements exist", async () => {
    const { count, error } = await supabase
      .from("engagements")
      .select("*", { count: "exact", head: true });
    if (error) return { passed: false, detail: `DB error: ${error.message}` };
    const n = count ?? 0;
    return { passed: n >= 1, detail: `count=${n}` };
  });

  // 4. Engagement health scores — count >= 1
  await check("Delivery intelligence — engagement_health_scores exist", async () => {
    const { count, error } = await supabase
      .from("engagement_health_scores")
      .select("*", { count: "exact", head: true });
    if (error) return { passed: false, detail: `DB error: ${error.message}` };
    const n = count ?? 0;
    return { passed: n >= 1, detail: `count=${n}` };
  });

  // 5. Pod match history — count >= 1
  await check("Pod match history exists", async () => {
    const { count, error } = await supabase
      .from("pod_match_history")
      .select("*", { count: "exact", head: true });
    if (error) return { passed: false, detail: `DB error: ${error.message}` };
    const n = count ?? 0;
    return { passed: n >= 1, detail: `count=${n}` };
  });

  // 6. Connector signals — count >= 1
  await check("Connector signals exist", async () => {
    const { count, error } = await supabase
      .from("connector_signals")
      .select("*", { count: "exact", head: true });
    if (error) return { passed: false, detail: `DB error: ${error.message}` };
    const n = count ?? 0;
    return { passed: n >= 1, detail: `count=${n}` };
  });

  // 7. Demo users exist in auth.users
  await check("Demo users exist (abhishek, jeeta, yuan.luo)", async () => {
    const demoEmails = [
      "abhishek@tookitaki.com",
      "jeeta@tookitaki.com",
      "yuan.luo@tookitaki.com",
    ];
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) return { passed: false, detail: `Auth admin error: ${error.message}` };

    const existingEmails = new Set((data?.users ?? []).map((u) => u.email));
    const found = demoEmails.filter((e) => existingEmails.has(e));
    const missing = demoEmails.filter((e) => !existingEmails.has(e));

    if (missing.length === 0) {
      return { passed: true, detail: `All 3 demo users found` };
    }
    return {
      passed: false,
      detail: `Missing: ${missing.join(", ")} | Found: ${found.join(", ")}`,
    };
  });

  // 8. se_aas_artifacts table accessible
  await check("se_aas_artifacts table accessible", async () => {
    const { count, error } = await supabase
      .from("se_aas_artifacts")
      .select("*", { count: "exact", head: true });
    if (error) return { passed: false, detail: `DB error: ${error.message}` };
    return { passed: true, detail: `Accessible, count=${count ?? 0}` };
  });

  // 9. Workspace memberships API requires auth (401)
  await check("Workspace memberships API requires auth", async () => {
    const res = await fetch(`${PROD_BASE}/api/workspace/memberships`);
    if (res.status === 401) {
      return { passed: true, detail: `HTTP 401 (auth required — endpoint exists and guards correctly)` };
    }
    if (res.status === 200) {
      return { passed: false, detail: `HTTP 200 without auth — potential security issue` };
    }
    return { passed: false, detail: `Unexpected HTTP ${res.status}` };
  });

  // 10. Copilot feedback API — 401 without auth
  await check("Copilot feedback API requires auth (401)", async () => {
    const res = await fetch(`${PROD_BASE}/api/copilot/feedback?organizationId=test`);
    if (res.status === 401) {
      return { passed: true, detail: `HTTP 401 (auth required — endpoint exists)` };
    }
    if (res.status === 200) {
      return { passed: false, detail: `HTTP 200 without auth — potential security issue` };
    }
    return { passed: false, detail: `Unexpected HTTP ${res.status}` };
  });

  // 11. Active Learning sidebar — file exists and contains ActiveLearningIndicator
  await check("Sidebar has ActiveLearningIndicator", async () => {
    const sidebarPath = "/Users/abhishek/Documents/Project/BrainOs/platform/components/layout/Sidebar.tsx";
    if (!fs.existsSync(sidebarPath)) {
      return { passed: false, detail: `File not found: ${sidebarPath}` };
    }
    const contents = fs.readFileSync(sidebarPath, "utf-8");
    const hasIndicator = contents.includes("ActiveLearningIndicator");
    if (hasIndicator) {
      return { passed: true, detail: `File exists and contains "ActiveLearningIndicator"` };
    }
    return { passed: false, detail: `File exists but "ActiveLearningIndicator" not found` };
  });

  // 12. Settings page — showToast defined (line ~145) before handleGithubConnect (line ~158)
  await check("Settings page: showToast defined before handleGithubConnect", async () => {
    const settingsPath =
      "/Users/abhishek/Documents/Project/BrainOs/platform/app/(home)/settings/settings-client.tsx";
    if (!fs.existsSync(settingsPath)) {
      return { passed: false, detail: `File not found: ${settingsPath}` };
    }
    const lines = fs.readFileSync(settingsPath, "utf-8").split("\n");
    let showToastLine = -1;
    let handleGithubLine = -1;
    lines.forEach((line, idx) => {
      if (showToastLine === -1 && line.includes("const showToast")) showToastLine = idx + 1;
      if (handleGithubLine === -1 && line.includes("const handleGithubConnect")) handleGithubLine = idx + 1;
    });
    if (showToastLine === -1) return { passed: false, detail: `showToast not found in file` };
    if (handleGithubLine === -1) return { passed: false, detail: `handleGithubConnect not found in file` };
    const correct = showToastLine < handleGithubLine;
    return {
      passed: correct,
      detail: `showToast at line ${showToastLine}, handleGithubConnect at line ${handleGithubLine} — ${correct ? "correct order" : "WRONG ORDER"}`,
    };
  });

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log("\n========================================");
  console.log(`  SUMMARY: ${passed}/${total} checks passed`);
  console.log("========================================");

  if (failed === 0) {
    console.log("\n  ALL SYSTEMS GO — Platform is demo-ready.\n");
  } else {
    console.log(`\n  ${failed} check(s) FAILED:\n`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - [FAIL] ${r.name}`);
        console.log(`           ${r.detail}`);
      });
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();

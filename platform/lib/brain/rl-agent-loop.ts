/**
 * RL Agent Loop — Reinforcement Learning integration for AI agents
 *
 * Implements the continuous learning loop:
 * 1. On agent startup: inject relevant case-log patterns as system context
 * 2. After task completion: log a retro entry to the DB (brain_case_log table)
 *
 * Storage strategy:
 *  - PRIMARY: brain_case_log DB table (works in AWS Lambda — no filesystem writes)
 *  - FALLBACK: .claude/case-log.md + .claude/cc-retro.md on local filesystem
 *    (graceful degradation for local dev where the DB may not be available)
 *
 * This closes the RL feedback loop for ALL agents (not just OpenClaw plugin).
 */

import fs from "fs";
import path from "path";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Path to the shared learning files (repo root .claude/) — local dev fallback only
const CLAUDE_DIR = path.join(process.cwd(), "..", ".claude");
const CASE_LOG_PATH = path.join(CLAUDE_DIR, "case-log.md");
const RETRO_PATH = path.join(CLAUDE_DIR, "cc-retro.md");

// ── Types ─────────────────────────────────────────────────────────────────

export interface AgentStartupContext {
  agentType: string;
  prompt: string;
  orgId: string;
}

export interface AgentTaskRetro {
  taskId: string;
  agentType: string;
  prompt: string;
  status: "completed" | "failed" | "partial";
  durationMs: number;
  modelUsed: string;
  tokensUsed?: number;
  outputSummary: string;
  whatWentWell?: string;
  whatWentWrong?: string;
}

// ── Case Log Injection ────────────────────────────────────────────────────

/**
 * Read the case log and extract patterns relevant to this agent type + prompt.
 * Returns a concise context string to inject into the agent's system prompt.
 * Max ~500 tokens to keep it lightweight.
 *
 * Strategy:
 *  1. Try DB (brain_case_log) — last 20 'case' entries for the org or global
 *  2. Fall back to local filesystem (.claude/case-log.md) if DB fails
 */
export async function getCaseLogContext(ctx: AgentStartupContext): Promise<string> {
  // ── 1. DB primary path ────────────────────────────────────────────────
  try {
    const supabase = getAdminClient();
    const { data: rows, error } = await supabase
      .from("brain_case_log")
      .select("content, tags, created_at")
      .eq("entry_type", "case")
      .or(`organization_id.eq.${ctx.orgId},organization_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && rows && rows.length > 0) {
      const relevantKeywords = getKeywordsForAgentType(ctx.agentType);
      const promptWords = ctx.prompt.toLowerCase().split(/\s+/).slice(0, 20);
      const allKeywords = [...relevantKeywords, ...promptWords];

      // Filter to relevant entries
      const relevant = rows.filter((row) => {
        const lower = row.content.toLowerCase();
        return allKeywords.some((kw) => lower.includes(kw));
      });

      const topEntries = relevant.slice(0, 3);
      if (topEntries.length === 0) return "";

      const combined = topEntries.map((r) => r.content).join("\n\n---\n\n");
      return `\n\n## Learned Patterns (from case log — apply these)\n${combined}\n`;
    }
  } catch (dbErr) {
    logger.warn("[rl-agent-loop] DB case log read failed, falling back to filesystem", { dbErr });
  }

  // ── 2. Filesystem fallback (local dev) ────────────────────────────────
  return getCaseLogContextFromFilesystem(ctx);
}

/**
 * Read case log from local filesystem — local dev fallback only.
 */
function getCaseLogContextFromFilesystem(ctx: AgentStartupContext): string {
  try {
    if (!fs.existsSync(CASE_LOG_PATH)) return "";

    const raw = fs.readFileSync(CASE_LOG_PATH, "utf-8");
    const lines = raw.split("\n");

    const relevantKeywords = getKeywordsForAgentType(ctx.agentType);
    const promptWords = ctx.prompt.toLowerCase().split(/\s+/).slice(0, 20);
    const allKeywords = [...relevantKeywords, ...promptWords];

    const cases: string[] = [];
    let currentCase: string[] = [];
    let inRelevantCase = false;

    for (const line of lines) {
      if (line.startsWith("## Case ")) {
        if (inRelevantCase && currentCase.length > 0) {
          cases.push(currentCase.slice(0, 15).join("\n")); // max 15 lines per case
        }
        currentCase = [line];
        inRelevantCase = allKeywords.some((kw) => line.toLowerCase().includes(kw));
      } else {
        currentCase.push(line);
        if (!inRelevantCase && allKeywords.some((kw) => line.toLowerCase().includes(kw))) {
          inRelevantCase = true;
        }
      }
    }
    if (inRelevantCase && currentCase.length > 0) {
      cases.push(currentCase.slice(0, 15).join("\n"));
    }

    if (cases.length === 0) return "";

    const topCases = cases.slice(-3).join("\n\n---\n\n");
    return `\n\n## Learned Patterns (from case log — apply these)\n${topCases}\n`;
  } catch {
    return ""; // Never block agent execution for logging failures
  }
}

/**
 * Map agent type to relevant search keywords for case log filtering
 */
function getKeywordsForAgentType(agentType: string): string[] {
  const keywordMap: Record<string, string[]> = {
    "train-brain": ["train", "brain", "learning", "rl", "reinforcement"],
    "code-review": ["code", "review", "pr", "diff", "typescript", "lint"],
    "build": ["build", "implement", "feature", "code", "typescript"],
    "diagnose": ["debug", "error", "crash", "fix", "root cause"],
    "test": ["test", "spec", "coverage", "tdd"],
    "analyze": ["analyze", "metrics", "causal", "signal"],
    "dependency-upgrade": ["dependency", "upgrade", "package", "npm"],
    "performance": ["performance", "slow", "latency", "memory"],
    "openclaw": ["openclaw", "gateway", "plugin", "reinforcement"],
    "general": ["error", "fix", "bug", "supabase", "next.js"],
  };
  return keywordMap[agentType] ?? keywordMap["general"];
}

// ── Retro Logging ─────────────────────────────────────────────────────────

/**
 * Log a retro entry after agent task completion.
 * Non-blocking — failures are silently swallowed.
 *
 * Strategy:
 *  1. Write to brain_case_log DB table (works on AWS Lambda)
 *  2. Best-effort write to local filesystem for local dev convenience
 */
export async function logAgentRetro(retro: AgentTaskRetro): Promise<void> {
  const timestamp = new Date().toISOString().split("T")[0];
  const durationSec = Math.round(retro.durationMs / 1000);
  const costLabel = retro.tokensUsed
    ? `~${Math.round(retro.tokensUsed / 1000)}K tokens`
    : "unknown";

  const content = `## Retro — ${timestamp}
**Task**: ${retro.agentType} agent — ${retro.prompt.slice(0, 100)}${retro.prompt.length > 100 ? "..." : ""}
**Status**: ${retro.status}
**Duration**: ${durationSec}s | **Model**: ${retro.modelUsed} | **Cost**: ${costLabel}
**Task ID**: ${retro.taskId}

**What went well**: ${retro.whatWentWell ?? retro.outputSummary.slice(0, 200)}
**What went wrong**: ${retro.whatWentWrong ?? (retro.status === "failed" ? "Task failed — check error in brain_agent_tasks" : "Nothing significant")}
**Model correction**: ${getModelCorrection(retro.modelUsed, retro.agentType)}
**Cost assessment**: ${getCostAssessment(retro.modelUsed, retro.tokensUsed)}`;

  // ── 1. DB primary path ────────────────────────────────────────────────
  try {
    const supabase = getAdminClient();
    await supabase.from("brain_case_log").insert({
      organization_id: null, // retros are system-level
      entry_type: "retro",
      content,
      tags: [retro.agentType, retro.status, retro.modelUsed],
    });
  } catch (dbErr) {
    logger.warn("[rl-agent-loop] DB retro write failed, falling back to filesystem", { dbErr });
  }

  // ── 2. Filesystem best-effort (local dev) ─────────────────────────────
  try {
    if (!fs.existsSync(path.dirname(RETRO_PATH))) return;

    // Count existing retros to get the next number
    let retroNumber = 1;
    if (fs.existsSync(RETRO_PATH)) {
      const existing = fs.readFileSync(RETRO_PATH, "utf-8");
      const matches = existing.match(/^## Retro \d+/gm);
      retroNumber = (matches?.length ?? 0) + 1;
    }

    const numberedEntry = `\n## Retro ${String(retroNumber).padStart(3, "0")} — ${timestamp}\n${content.replace(/^## Retro — [^\n]+\n/, "")}\n---\n`;
    fs.appendFileSync(RETRO_PATH, numberedEntry, "utf-8");
  } catch {
    // Never block execution for retro logging failures
  }
}

function getModelCorrection(model: string, agentType: string): string {
  if (model.includes("opus") && ["test", "build", "code-review"].includes(agentType)) {
    return `Used Opus for ${agentType} — could have used Sonnet (4x cheaper)`;
  }
  if (model.includes("sonnet") && ["diagnose", "analyze"].includes(agentType)) {
    return `Sonnet for ${agentType} — appropriate choice`;
  }
  return "Model selection appropriate for task complexity";
}

function getCostAssessment(model: string, tokens?: number): string {
  if (!tokens) return "Token count unavailable";
  const cost = model.includes("haiku")
    ? tokens * 0.00000025
    : model.includes("sonnet")
    ? tokens * 0.000003
    : tokens * 0.000015;
  return `~$${cost.toFixed(4)} — ${model.includes("haiku") ? "optimal" : model.includes("sonnet") ? "reasonable" : "expensive — check if Sonnet could do this"}`;
}

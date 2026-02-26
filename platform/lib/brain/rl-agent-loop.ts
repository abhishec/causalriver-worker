/**
 * RL Agent Loop — Reinforcement Learning integration for AI agents
 *
 * Implements the continuous learning loop:
 * 1. On agent startup: inject relevant case-log patterns as system context
 * 2. After task completion: log a retro entry to cc-retro.md
 *
 * This closes the RL feedback loop for ALL agents (not just OpenClaw plugin).
 */

import fs from "fs";
import path from "path";

// Path to the shared learning files (repo root .claude/)
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
 * Max 500 tokens to keep it lightweight.
 */
export function getCaseLogContext(ctx: AgentStartupContext): string {
  try {
    if (!fs.existsSync(CASE_LOG_PATH)) return "";

    const raw = fs.readFileSync(CASE_LOG_PATH, "utf-8");
    const lines = raw.split("\n");

    // Extract case entries that are relevant to this agent type
    const relevantKeywords = getKeywordsForAgentType(ctx.agentType);
    const promptWords = ctx.prompt.toLowerCase().split(/\s+/).slice(0, 20);
    const allKeywords = [...relevantKeywords, ...promptWords];

    // Find case entries (start with "## Case ")
    const cases: string[] = [];
    let currentCase: string[] = [];
    let inRelevantCase = false;

    for (const line of lines) {
      if (line.startsWith("## Case ")) {
        if (inRelevantCase && currentCase.length > 0) {
          cases.push(currentCase.slice(0, 15).join("\n")); // max 15 lines per case
        }
        currentCase = [line];
        inRelevantCase = allKeywords.some(kw =>
          line.toLowerCase().includes(kw)
        );
      } else {
        currentCase.push(line);
        // Check body for relevance too
        if (!inRelevantCase && allKeywords.some(kw => line.toLowerCase().includes(kw))) {
          inRelevantCase = true;
        }
      }
    }
    if (inRelevantCase && currentCase.length > 0) {
      cases.push(currentCase.slice(0, 15).join("\n"));
    }

    if (cases.length === 0) return "";

    // Take up to 3 most relevant cases
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
 * Appends to cc-retro.md in the standard format.
 */
export async function logAgentRetro(retro: AgentTaskRetro): Promise<void> {
  try {
    if (!fs.existsSync(path.dirname(RETRO_PATH))) return;

    // Count existing retros to get the next number
    let retroNumber = 1;
    if (fs.existsSync(RETRO_PATH)) {
      const existing = fs.readFileSync(RETRO_PATH, "utf-8");
      const matches = existing.match(/^## Retro \d+/gm);
      retroNumber = (matches?.length ?? 0) + 1;
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const durationSec = Math.round(retro.durationMs / 1000);
    const costLabel = retro.tokensUsed
      ? `~${Math.round(retro.tokensUsed / 1000)}K tokens`
      : "unknown";

    const entry = `
## Retro ${String(retroNumber).padStart(3, "0")} — ${timestamp}
**Task**: ${retro.agentType} agent — ${retro.prompt.slice(0, 100)}${retro.prompt.length > 100 ? "..." : ""}
**Status**: ${retro.status}
**Duration**: ${durationSec}s | **Model**: ${retro.modelUsed} | **Cost**: ${costLabel}
**Task ID**: ${retro.taskId}

**What went well**: ${retro.whatWentWell ?? retro.outputSummary.slice(0, 200)}
**What went wrong**: ${retro.whatWentWrong ?? (retro.status === "failed" ? "Task failed — check error in brain_agent_tasks" : "Nothing significant")}
**Model correction**: ${getModelCorrection(retro.modelUsed, retro.agentType)}
**Cost assessment**: ${getCostAssessment(retro.modelUsed, retro.tokensUsed)}

---
`;

    fs.appendFileSync(RETRO_PATH, entry, "utf-8");
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

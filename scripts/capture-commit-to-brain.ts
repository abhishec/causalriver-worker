#!/usr/bin/env tsx
/**
 * Capture git commit decisions to the brain training pipeline.
 * Runs in GitHub Actions on every push to main.
 * Extracts: what changed, why, domain → writes to ai_memory as code.decision
 */

import { execSync } from "child_process";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const COMMIT_HASH = process.env.COMMIT_HASH ?? "unknown";
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE ?? "";
const COMMIT_AUTHOR = process.env.COMMIT_AUTHOR ?? "unknown";
const COMMIT_TIMESTAMP = process.env.COMMIT_TIMESTAMP ?? new Date().toISOString();
const APP_URL = process.env.APP_URL ?? "https://platform.usebrainos.com";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/**
 * Commit prefixes that signal a session boundary — meaning the commit
 * represents a meaningful system-level change to the brain, RL pipeline,
 * or security layer.  When one of these is detected we fire an additional
 * CC learning consolidation snapshot so the brain captures the full session
 * context at the moment the code lands in production.
 */
const SESSION_BOUNDARY_PREFIXES = [
  "feat(brain)",
  "feat(rl)",
  "fix(rl-audit)",
  "fix(security)",
  "fix(audit",
  "feat(orchestrat",
  "feat(memory",
  "feat(session",
];

function isSessionBoundaryCommit(message: string): boolean {
  const lower = message.toLowerCase();
  return SESSION_BOUNDARY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

async function main() {
  console.log(`Capturing commit ${COMMIT_HASH.slice(0, 7)} to brain...`);

  // Get the diff (files changed + summary)
  let diffSummary = "";
  try {
    const stat = execSync("git diff --stat HEAD~1 HEAD 2>/dev/null || git show --stat HEAD", {
      encoding: "utf8",
      timeout: 10000,
    });
    diffSummary = stat.slice(0, 2000); // Cap at 2000 chars
  } catch {
    diffSummary = "Diff unavailable";
  }

  // Detect domain from commit message prefix
  const domain = detectDomain(COMMIT_MESSAGE);
  const importance = detectImportance(COMMIT_MESSAGE);

  // If Anthropic key available, use Haiku to extract structured decision
  let structuredContent = `Commit ${COMMIT_HASH.slice(0, 7)}: ${COMMIT_MESSAGE}`;

  if (ANTHROPIC_API_KEY) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: `Analyze this git commit and extract a structured decision record for a brain training system.

Commit message: ${COMMIT_MESSAGE}

Files changed:
${diffSummary}

Return a 2-3 sentence structured description:
- What was built/fixed (specific)
- What problem it solves
- Why this approach was chosen (from commit message context)

Keep it factual, technical, and under 300 words. No markdown headers.`,
            },
          ],
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          content: Array<{ type: string; text: string }>;
        };
        const text =
          data.content[0]?.type === "text" ? data.content[0].text : "";
        if (text) structuredContent = text;
      }
    } catch (err) {
      console.warn("Haiku extraction failed, using raw commit message:", err);
    }
  }

  // Fetch all active org IDs (write to all orgs — this is system-level knowledge)
  const orgsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?select=id&limit=50`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!orgsResp.ok) {
    console.error("Failed to fetch orgs:", orgsResp.status);
    process.exit(0); // Non-fatal
  }

  const orgs = (await orgsResp.json()) as Array<{ id: string }>;
  console.log(`Writing to ${orgs.length} orgs...`);

  // Write to ai_memory for each org
  for (const org of orgs) {
    const record = {
      organization_id: org.id,
      memory_type: "knowledge",
      domain: `code.commit.${domain}`,
      content: structuredContent,
      importance: importance,
      metadata: {
        commitHash: COMMIT_HASH.slice(0, 7),
        commitMessage: COMMIT_MESSAGE.slice(0, 500),
        author: COMMIT_AUTHOR,
        timestamp: COMMIT_TIMESTAMP,
        filesChanged: diffSummary.slice(0, 500),
        capturedBy: "brain-training-hook",
      },
    };

    const writeResp = await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(record),
    });

    if (!writeResp.ok) {
      console.warn(`Failed to write to org ${org.id}:`, writeResp.status);
    }
  }

  console.log(
    `Commit ${COMMIT_HASH.slice(0, 7)} captured to brain (domain: ${domain}, importance: ${importance})`
  );

  // ── Session boundary check ─────────────────────────────────────────────────
  // If this commit is tagged as a brain/rl/security session boundary, also
  // fire the CC learning consolidation endpoint so the brain gets a full
  // session snapshot at the moment the code lands — not just the raw commit.
  if (isSessionBoundaryCommit(COMMIT_MESSAGE) && CRON_SECRET) {
    console.log(
      `Session boundary commit detected ("${COMMIT_MESSAGE.slice(0, 60)}..."). Triggering CC learning consolidation...`
    );
    try {
      const consolidateResp = await fetch(`${APP_URL}/api/brain/cc-learning`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        signal: AbortSignal.timeout(120_000),
      });

      if (consolidateResp.ok) {
        const result = (await consolidateResp.json()) as {
          recordsProcessed?: number;
          orgsUpdated?: number;
        };
        console.log(
          `CC learning consolidation complete: ${result.recordsProcessed ?? 0} records, ${result.orgsUpdated ?? 0} orgs updated`
        );
      } else {
        console.warn(
          `CC learning consolidation returned ${consolidateResp.status} (non-fatal)`
        );
      }
    } catch (err) {
      console.warn("CC learning consolidation failed (non-fatal):", err);
    }
  }
}

function detectDomain(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("security") ||
    lower.includes("audit") ||
    lower.includes("rls")
  )
    return "security";
  if (
    lower.includes("brain") ||
    lower.includes("memory") ||
    lower.includes("rl")
  )
    return "brain";
  if (
    lower.includes("agent") ||
    lower.includes("openclaw") ||
    lower.includes("seaas")
  )
    return "agents";
  if (
    lower.includes("connector") ||
    lower.includes("github") ||
    lower.includes("slack") ||
    lower.includes("jira")
  )
    return "connectors";
  if (
    lower.includes("embed") ||
    lower.includes("vector") ||
    lower.includes("chunk")
  )
    return "retrieval";
  if (
    lower.includes("cron") ||
    lower.includes("schedule") ||
    lower.includes("worker")
  )
    return "infrastructure";
  return "platform";
}

function detectImportance(message: string): number {
  const lower = message.toLowerCase();
  if (lower.startsWith("fix(security)") || lower.startsWith("fix(audit)"))
    return 0.95;
  if (lower.startsWith("feat(brain)") || lower.startsWith("feat(rl)"))
    return 0.85;
  if (lower.startsWith("feat(") || lower.startsWith("fix(")) return 0.75;
  if (lower.startsWith("chore(") || lower.startsWith("docs(")) return 0.3;
  return 0.6;
}

main().catch((err) => {
  console.error("Brain training hook failed:", err);
  process.exit(0); // Non-fatal — never block CI/CD pipeline
});

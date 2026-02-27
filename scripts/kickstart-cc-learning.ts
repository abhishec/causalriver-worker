/**
 * One-shot CC learning kickstart.
 * Reads recent ai_memory CC records, synthesises with Haiku, upserts consolidation.
 * Run: pnpm exec tsx scripts/kickstart-cc-learning.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const CC_EVENT_SOURCES = [
  "command_center_session",
  "git_commit_training",
  "orchestration_intelligence",
];

async function run() {
  console.log("=== CC Learning Kickstart ===");
  console.log("Querying brain records from last 8 hours...\n");

  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

  // Query CC records
  const { data: rows, error } = await admin
    .from("ai_memory")
    .select("id, organization_id, domain, content, importance, created_at")
    .or(
      [
        ...CC_EVENT_SOURCES.map((s) => `metadata->>source.eq.${s}`),
        "domain.like.session.%",
        "domain.like.code.commit.%",
      ].join(",")
    )
    .gte("created_at", eightHoursAgo)
    .order("importance", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Query error:", error.message);
    process.exit(1);
  }

  const records = rows ?? [];
  console.log(`Found ${records.length} CC records.\n`);

  // Show breakdown
  const byDomain: Record<string, number> = {};
  for (const r of records) {
    byDomain[r.domain] = (byDomain[r.domain] ?? 0) + 1;
  }
  for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x  ${domain}`);
  }
  console.log();

  if (records.length === 0) {
    console.log("No CC records to consolidate.");
    return;
  }

  // Synthesise with Haiku
  let summary: string;
  if (ANTHROPIC_API_KEY) {
    console.log("Synthesising with claude-haiku-4-5-20251001...");
    const recordsText = records
      .slice(0, 20)
      .map((r, i) => `[${i + 1}] domain=${r.domain} importance=${r.importance}\n${r.content.slice(0, 300)}`)
      .join("\n\n");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are summarising what the BrainOS command center learned in the last 8 hours.

Below are the most important memory records (sorted by importance):

${recordsText}

Write a concise 200-word "What the CC learned this session" digest:
- Key decisions made and why (architectural, tooling, routing)
- Patterns discovered or reinforced
- Anti-patterns avoided
- What changed in the platform

Be specific and factual. No markdown headers. Plain prose only.`,
          },
        ],
      }),
    });

    if (resp.ok) {
      const data = await resp.json() as { content: Array<{ type: string; text: string }> };
      summary = data.content[0]?.type === "text" ? data.content[0].text.trim() : "";
    } else {
      console.warn(`Haiku failed (${resp.status}), falling back to structured summary`);
      summary = `CC session (${records.length} records, ${new Date().toISOString()}): ` +
        records.slice(0, 5).map(r => `[${r.domain}] ${r.content.slice(0, 100)}`).join(" | ");
    }
  } else {
    summary = `CC session (${records.length} records): ` +
      records.slice(0, 5).map(r => `[${r.domain}] ${r.content.slice(0, 100)}`).join(" | ");
  }

  console.log("\n=== SYNTHESIS ===");
  console.log(summary);
  console.log();

  // Get distinct org IDs
  const orgIds = [...new Set(records.map(r => r.organization_id))];
  console.log(`Upserting to ${orgIds.length} orgs: ${orgIds.map(id => id.slice(0, 8) + "...").join(", ")}\n`);

  let success = 0;
  for (const orgId of orgIds) {
    const { error: upsertErr } = await admin.from("ai_memory").upsert(
      {
        organization_id: orgId,
        domain: "session.cc_consolidation",
        memory_type: "knowledge",
        content: summary.slice(0, 1000),
        importance: 0.92,
        metadata: {
          source: "cc_learning_cron",
          event_source: "cc_learning_cron",
          recordsProcessed: records.length,
          consolidatedAt: new Date().toISOString(),
          synthesisModel: "claude-haiku-4-5-20251001",
          kickstarted: true,
        },
      },
      { onConflict: "organization_id,memory_type,domain", ignoreDuplicates: false }
    );
    if (upsertErr) {
      console.warn(`  ✗ Upsert failed for ${orgId.slice(0, 8)}: ${upsertErr.message}`);
    } else {
      console.log(`  ✓ ${orgId.slice(0, 8)}... — session.cc_consolidation written`);
      success++;
    }
  }

  console.log(`\n✅ Done — ${success}/${orgIds.length} orgs updated, ${records.length} records consolidated into brain.`);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

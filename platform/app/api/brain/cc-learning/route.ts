import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Event source values we treat as CC session activity
const CC_EVENT_SOURCES = [
  "command_center_session",
  "git_commit_training",
  "orchestration_intelligence",
];

interface AiMemoryRow {
  id: string;
  organization_id: string;
  domain: string;
  content: string;
  importance: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
}

/**
 * GET /api/brain/cc-learning
 *
 * Reads recent ai_memory records written by the command center in the last 8
 * hours, synthesises a 200-word consolidation summary using Haiku, and upserts
 * the result back into ai_memory so the brain has a rolling session digest.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request): Promise<NextResponse> {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const isCron =
    cronSecret !== undefined &&
    cronSecret.length > 0 &&
    authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Admin client ───────────────────────────────────────────────────────────
  let adminClient: ReturnType<typeof getAdminClient>;
  try {
    adminClient = getAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // ── Query recent CC activity from ai_memory ────────────────────────────────
  // We use a raw PostgREST filter on the metadata->>'event_source' column
  // because universalBrainWrite stores the source in metadata.source.
  // We also accept rows whose domain starts with "session." which is the
  // pattern used by captureDecisionPattern / captureLessonLearned.
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: queryError } = await adminClient
    .from("ai_memory")
    .select("id, organization_id, domain, content, importance, metadata, created_at")
    .or(
      [
        ...CC_EVENT_SOURCES.map((s) => `metadata->>source.eq.${s}`),
        "domain.like.session.%",
      ].join(",")
    )
    .gte("created_at", eightHoursAgo)
    .order("importance", { ascending: false })
    .limit(20);

  if (queryError) {
    logger.error("[/api/brain/cc-learning] query error:", queryError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const records = (rows ?? []) as AiMemoryRow[];
  logger.warn(`[/api/brain/cc-learning] Found ${records.length} recent CC records`);

  if (records.length === 0) {
    return NextResponse.json({
      ok: true,
      recordsProcessed: 0,
      summary: null,
      message: "No CC activity in the last 8 hours",
    });
  }

  // ── Synthesise with Haiku ──────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  let summary: string | null = null;

  if (anthropicKey) {
    try {
      const recordsText = records
        .map(
          (r, i) =>
            `[${i + 1}] domain=${r.domain} importance=${r.importance}\n${r.content.slice(0, 300)}`
        )
        .join("\n\n");

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: `You are summarising what the BrainOS command center session learned in the last 8 hours.

Below are the most important memory records written during this session, sorted by importance:

${recordsText}

Write a concise 150-200 word "What the CC learned this session" digest:
- Key decisions made and why
- Patterns discovered or reinforced
- Anti-patterns avoided
- What changed in the system

Be specific and factual. No markdown headers. Plain prose only.`,
            },
          ],
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as AnthropicMessage;
        const text =
          data.content[0]?.type === "text" ? data.content[0].text.trim() : "";
        if (text) summary = text;
      } else {
        logger.warn(`[/api/brain/cc-learning] Haiku synthesis failed: ${resp.status}`);
      }
    } catch (err) {
      logger.warn("[/api/brain/cc-learning] Haiku synthesis error (graceful degradation):", err);
    }
  }

  // Fall back to a structured concatenation if Haiku is unavailable
  if (!summary) {
    summary = [
      `CC session consolidation (${records.length} records, ${new Date().toISOString()}):`,
      ...records.slice(0, 5).map((r) => `- [${r.domain}] ${r.content.slice(0, 120)}`),
    ].join("\n");
  }

  // ── Collect distinct org IDs from the records ──────────────────────────────
  const orgIds = [...new Set(records.map((r) => r.organization_id))];

  // ── Upsert consolidation summary back into ai_memory (per org) ────────────
  let upsertErrors = 0;
  for (const orgId of orgIds) {
    const { error: upsertError } = await adminClient.from("ai_memory").upsert(
      {
        organization_id: orgId,
        domain: "session.cc_consolidation",
        memory_type: "knowledge",
        content: summary.slice(0, 1000),
        importance: 0.9,
        metadata: {
          source: "cc_learning_cron",
          event_source: "cc_learning_cron",
          recordsProcessed: records.length,
          consolidatedAt: new Date().toISOString(),
          synthesisModel: "claude-haiku-4-5-20251001",
        },
      },
      {
        onConflict: "organization_id,memory_type,domain",
        ignoreDuplicates: false,
      }
    );

    if (upsertError) {
      logger.warn(`[/api/brain/cc-learning] upsert failed for org ${orgId}:`, upsertError);
      upsertErrors += 1;
    }
  }

  logger.warn(
    `[/api/brain/cc-learning] Consolidated ${records.length} CC records across ${orgIds.length} orgs (${upsertErrors} upsert errors)`
  );

  return NextResponse.json({
    ok: true,
    recordsProcessed: records.length,
    orgsUpdated: orgIds.length - upsertErrors,
    upsertErrors,
    summary,
  });
}

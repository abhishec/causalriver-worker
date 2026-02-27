/**
 * POST /api/brain/ingest-cc-learnings
 * =====================================
 * On-demand trigger for the CC learning ingestion pipeline.
 * Parses .claude/case-log.md and .claude/cc-retro.md and writes each section
 * as an ai_memory row (domain='cc-learnings' / 'cc-retro') and a knowledge_chunks
 * row (source_type='code_file') into the Core Brain.
 *
 * High-priority entries ([USER CORRECTION], CRITICAL, ⚠️) are also federated
 * to the two Tookitaki AI worker space org IDs.
 *
 * Deduplication: source_id hash prevents duplicate rows on re-runs.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes — parsing + bulk inserts

// ── Workspace IDs ──────────────────────────────────────────────────────────────
const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

// Tookitaki's two AI worker spaces (Fincense 5.11.5 + 6.3.4)
const TOOKITAKI_WORKSPACE_IDS = [
  "9f338d96-fb02-45b2-b6bf-38269c32ddc8", // Fincense 5.11.5
  "aa286f56-34f7-467f-9685-6f4ed12bf17e", // Fincense 6.3.4
];

// ── Path to source files (relative to repo root, mounted by Amplify build) ────
// In Lambda runtime these files are included in the build artifact because they
// live at repo root level and Amplify copies the full working directory.
const REPO_ROOT = resolve(process.cwd(), "..");
const CASE_LOG_PATHS = [
  resolve(process.cwd(), "..", ".claude", "case-log.md"),
  resolve(process.cwd(), ".claude", "case-log.md"),
];
const RETRO_PATHS = [
  resolve(process.cwd(), "..", ".claude", "cc-retro.md"),
  resolve(process.cwd(), ".claude", "cc-retro.md"),
];

function findFile(candidates: string[]): string | null {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function splitIntoSections(markdown: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const lines = markdown.split("\n");
  let currentHeading = "(preamble)";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentLines.length > 0) {
        const body = currentLines.join("\n").trim();
        if (body) sections.push({ heading: currentHeading, body });
      }
      currentHeading = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    const body = currentLines.join("\n").trim();
    if (body) sections.push({ heading: currentHeading, body });
  }
  return sections;
}

function isHighPriority(heading: string, body: string): boolean {
  const text = `${heading} ${body}`;
  return (
    text.includes("[USER CORRECTION]") ||
    text.includes("CRITICAL") ||
    text.includes("[USER FEEDBACK]") ||
    text.includes("⚠️")
  );
}

interface IngestStats {
  aiMemoryInserted: number;
  aiMemorySkipped: number;
  knowledgeChunksInserted: number;
  knowledgeChunksSkipped: number;
  federatedInserted: number;
}

async function ingestSections(
  sections: Array<{ heading: string; body: string }>,
  opts: {
    domain: string;
    memoryType: string;
    importance: number;
    sourceFile: string;
    orgId: string;
  }
): Promise<IngestStats> {
  const supabase = getAdminClient();
  const stats: IngestStats = {
    aiMemoryInserted: 0,
    aiMemorySkipped: 0,
    knowledgeChunksInserted: 0,
    knowledgeChunksSkipped: 0,
    federatedInserted: 0,
  };

  for (const section of sections) {
    if (!section.body || section.body.length < 20) continue;

    const content = `## ${section.heading}\n\n${section.body}`;
    const sectionHash = shortHash(content);
    const sourceId = `${opts.sourceFile}-${sectionHash}`;

    // ── 1. ai_memory — check dedup via metadata.source_id ─────────────────────
    const { data: existing } = await supabase
      .from("ai_memory")
      .select("id")
      .eq("organization_id", opts.orgId)
      .eq("domain", opts.domain)
      .contains("metadata", { source_id: sourceId })
      .maybeSingle();

    if (existing) {
      stats.aiMemorySkipped++;
    } else {
      const { error: memErr } = await supabase.from("ai_memory").insert({
        organization_id: opts.orgId,
        domain: opts.domain,
        memory_type: opts.memoryType,
        content: content.slice(0, 2000),
        importance: opts.importance,
        metadata: {
          source: "cc_learning_kickstart",
          source_file: opts.sourceFile,
          source_id: sourceId,
          heading: section.heading,
          ingestedAt: new Date().toISOString(),
          isHighPriority: isHighPriority(section.heading, section.body),
        },
      });

      if (memErr) {
        logger.warn(`[ingest-cc-learnings] ai_memory insert failed for "${section.heading}": ${memErr.message}`);
      } else {
        stats.aiMemoryInserted++;
      }
    }

    // ── 2. knowledge_chunks — upsert with ON CONFLICT DO NOTHING ──────────────
    const { error: chunkErr, data: chunkResult } = await supabase
      .from("knowledge_chunks")
      .upsert(
        {
          organization_id: opts.orgId,
          source_type: "code_file",
          source_id: sourceId,
          verbatim_text: content.slice(0, 8000),
          ingested_by: "cc_learning_kickstart",
          metadata: {
            source_file: opts.sourceFile,
            heading: section.heading,
            domain: opts.domain,
            isHighPriority: isHighPriority(section.heading, section.body),
          },
        },
        {
          onConflict: "organization_id,source_id",
          ignoreDuplicates: true,
        }
      )
      .select("id");

    if (chunkErr) {
      logger.warn(`[ingest-cc-learnings] knowledge_chunks upsert failed for "${section.heading}": ${chunkErr.message}`);
    } else if (chunkResult && chunkResult.length > 0) {
      stats.knowledgeChunksInserted++;
    } else {
      stats.knowledgeChunksSkipped++;
    }

    // ── 3. Federated push to Tookitaki workspaces (high-priority only) ────────
    if (isHighPriority(section.heading, section.body)) {
      for (const workspaceId of TOOKITAKI_WORKSPACE_IDS) {
        const federatedSourceId = `${sourceId}-federated-${workspaceId.slice(0, 8)}`;

        const { data: fedExisting } = await supabase
          .from("ai_memory")
          .select("id")
          .eq("organization_id", workspaceId)
          .eq("domain", opts.domain)
          .contains("metadata", { source_id: federatedSourceId })
          .maybeSingle();

        if (!fedExisting) {
          const { error: fedErr } = await supabase.from("ai_memory").insert({
            organization_id: workspaceId,
            domain: opts.domain,
            memory_type: opts.memoryType,
            content: content.slice(0, 2000),
            importance: Math.min(opts.importance + 0.05, 1.0),
            metadata: {
              source: "cc_learning_federated",
              source_file: opts.sourceFile,
              source_id: federatedSourceId,
              heading: section.heading,
              federatedFrom: CORE_ORG_ID,
              ingestedAt: new Date().toISOString(),
              isHighPriority: true,
            },
          });

          if (fedErr) {
            logger.warn(`[ingest-cc-learnings] Federated insert failed for workspace ${workspaceId.slice(0, 8)}: ${fedErr.message}`);
          } else {
            stats.federatedInserted++;
          }
        }
      }
    }
  }

  return stats;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const isCron =
    !!cronSecret && cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Admin client ──────────────────────────────────────────────────────────
  let _supabase: ReturnType<typeof getAdminClient>;
  try {
    _supabase = getAdminClient();
    void _supabase; // existence check — actual calls use getAdminClient() inside ingestSections
  } catch {
    return NextResponse.json({ error: "Server misconfigured — missing Supabase credentials" }, { status: 500 });
  }

  // ── Locate source files ───────────────────────────────────────────────────
  const caseLogPath = findFile(CASE_LOG_PATHS);
  const retroPath = findFile(RETRO_PATHS);

  if (!caseLogPath) {
    logger.warn(`[ingest-cc-learnings] case-log.md not found. Searched: ${CASE_LOG_PATHS.join(", ")}`);
    return NextResponse.json(
      { error: "case-log.md not found — files may not be bundled in Lambda deployment" },
      { status: 404 }
    );
  }
  if (!retroPath) {
    logger.warn(`[ingest-cc-learnings] cc-retro.md not found. Searched: ${RETRO_PATHS.join(", ")}`);
    return NextResponse.json(
      { error: "cc-retro.md not found — files may not be bundled in Lambda deployment" },
      { status: 404 }
    );
  }

  // ── Parse files ───────────────────────────────────────────────────────────
  const caseLogContent = readFileSync(caseLogPath, "utf-8");
  const retroContent = readFileSync(retroPath, "utf-8");

  const caseLogSections = splitIntoSections(caseLogContent);
  const retroSections = splitIntoSections(retroContent);

  logger.warn(`[ingest-cc-learnings] Parsed: case-log=${caseLogSections.length} sections, cc-retro=${retroSections.length} sections`);

  // ── Ingest case-log.md ────────────────────────────────────────────────────
  const caseLogStats = await ingestSections(caseLogSections, {
    domain: "cc-learnings",
    memoryType: "episodic",
    importance: 0.88,
    sourceFile: "case-log",
    orgId: CORE_ORG_ID,
  });

  // ── Ingest cc-retro.md ────────────────────────────────────────────────────
  const retroStats = await ingestSections(retroSections, {
    domain: "cc-retro",
    memoryType: "episodic",
    importance: 0.82,
    sourceFile: "cc-retro",
    orgId: CORE_ORG_ID,
  });

  const totalInserted =
    caseLogStats.aiMemoryInserted + retroStats.aiMemoryInserted +
    caseLogStats.knowledgeChunksInserted + retroStats.knowledgeChunksInserted;

  const totalSkipped =
    caseLogStats.aiMemorySkipped + retroStats.aiMemorySkipped +
    caseLogStats.knowledgeChunksSkipped + retroStats.knowledgeChunksSkipped;

  const totalFederated = caseLogStats.federatedInserted + retroStats.federatedInserted;

  logger.warn(
    `[ingest-cc-learnings] Done: inserted=${totalInserted}, skipped=${totalSkipped}, federated=${totalFederated}`
  );

  return NextResponse.json({
    ok: true,
    caseLog: {
      sections: caseLogSections.length,
      ...caseLogStats,
    },
    retro: {
      sections: retroSections.length,
      ...retroStats,
    },
    summary: {
      totalInserted,
      totalSkipped,
      totalFederated,
      coreOrgId: CORE_ORG_ID,
      federatedWorkspaces: TOOKITAKI_WORKSPACE_IDS.length,
    },
  });
}

// ── Also export GET for manual browser testing (same auth required) ────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}

// Suppress unused import warning — REPO_ROOT is used for path resolution context
void REPO_ROOT;

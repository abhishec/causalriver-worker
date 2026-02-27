/**
 * CC Learning Kickstart — Full Pipeline
 * ======================================
 * Ingests .claude/case-log.md and .claude/cc-retro.md into:
 *   1. ai_memory (core brain, domain='cc-learnings' or 'cc-retro')
 *   2. knowledge_chunks (Tier 1 RAG store, source_type='code_file')
 *   3. Federated push: high-priority entries [USER CORRECTION] / CRITICAL
 *      also written to the two Tookitaki workspace org IDs.
 *
 * Deduplication: knowledge_chunks uses ON CONFLICT (org, source_id) DO NOTHING.
 * ai_memory uses upsert on (organization_id, memory_type, domain, source_id hash).
 *
 * Run: cd /Users/abhishek/Documents/Project/BrainOs && npx tsx scripts/kickstart-cc-learning.ts
 * Or:  POST /api/brain/ingest-cc-learnings (CRON_SECRET auth)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

// ── Path resolution ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname_resolved = dirname(__filename);
const REPO_ROOT = resolve(__dirname_resolved, "..");

// ── Load .env.local if running as a script ────────────────────────────────────
const envPath = resolve(REPO_ROOT, "platform", ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Workspace IDs ──────────────────────────────────────────────────────────────
const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

// Tookitaki's two AI worker spaces (Fincense 5.11.5 + 6.3.4)
const TOOKITAKI_WORKSPACE_IDS = [
  "9f338d96-fb02-45b2-b6bf-38269c32ddc8", // Fincense 5.11.5
  "aa286f56-34f7-467f-9685-6f4ed12bf17e", // Fincense 6.3.4
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Stable short hash for deduplication */
function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Split a markdown file into logical sections (## headings = sections) */
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

/** Determine if a section is high-priority (gets federated to customer workspaces) */
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

/**
 * Ingest sections from a markdown file into ai_memory + knowledge_chunks.
 * Uses source_id for deduplication so re-runs are safe.
 */
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

    // ── 1. Upsert into ai_memory ─────────────────────────────────────────────
    // We store source_id in metadata for dedup lookup; ai_memory has no unique
    // constraint on source_id so we check for existing rows first.
    const { data: existing } = await admin
      .from("ai_memory")
      .select("id")
      .eq("organization_id", opts.orgId)
      .eq("domain", opts.domain)
      .contains("metadata", { source_id: sourceId })
      .maybeSingle();

    if (existing) {
      stats.aiMemorySkipped++;
    } else {
      const { error: memErr } = await admin.from("ai_memory").insert({
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
        console.warn(`  [ai_memory] Insert failed for "${section.heading}": ${memErr.message}`);
      } else {
        stats.aiMemoryInserted++;
      }
    }

    // ── 2. Upsert into knowledge_chunks (Tier 1 RAG) ─────────────────────────
    // Uses partial unique index: (organization_id, source_id) WHERE source_id IS NOT NULL
    const { error: chunkErr, data: chunkResult } = await admin
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
      console.warn(`  [knowledge_chunks] Upsert failed for "${section.heading}": ${chunkErr.message}`);
    } else if (chunkResult && chunkResult.length > 0) {
      stats.knowledgeChunksInserted++;
    } else {
      stats.knowledgeChunksSkipped++;
    }

    // ── 3. Federated push to Tookitaki workspaces (high-priority only) ────────
    if (isHighPriority(section.heading, section.body)) {
      for (const workspaceId of TOOKITAKI_WORKSPACE_IDS) {
        const federatedSourceId = `${sourceId}-federated-${workspaceId.slice(0, 8)}`;

        const { data: fedExisting } = await admin
          .from("ai_memory")
          .select("id")
          .eq("organization_id", workspaceId)
          .eq("domain", opts.domain)
          .contains("metadata", { source_id: federatedSourceId })
          .maybeSingle();

        if (!fedExisting) {
          const { error: fedErr } = await admin.from("ai_memory").insert({
            organization_id: workspaceId,
            domain: opts.domain,
            memory_type: opts.memoryType,
            content: content.slice(0, 2000),
            importance: opts.importance + 0.05, // Slightly higher — it was important enough to federate
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
            console.warn(`  [federated] Insert failed for workspace ${workspaceId.slice(0, 8)}: ${fedErr.message}`);
          } else {
            stats.federatedInserted++;
          }
        }
      }
    }
  }

  return stats;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function runCCLearningKickstart(): Promise<{
  caseLog: IngestStats;
  retro: IngestStats;
  totalSections: number;
}> {
  console.log("=== CC Learning Kickstart ===");
  console.log(`Core Brain org: ${CORE_ORG_ID}`);
  console.log(`Federated workspaces: ${TOOKITAKI_WORKSPACE_IDS.length} (Tookitaki Fincense 5.11.5 + 6.3.4)`);
  console.log();

  // ── Read source files ──────────────────────────────────────────────────────
  const caseLogPath = resolve(REPO_ROOT, ".claude", "case-log.md");
  const retroPath = resolve(REPO_ROOT, ".claude", "cc-retro.md");

  if (!existsSync(caseLogPath)) {
    console.error(`case-log.md not found at ${caseLogPath}`);
    process.exit(1);
  }
  if (!existsSync(retroPath)) {
    console.error(`cc-retro.md not found at ${retroPath}`);
    process.exit(1);
  }

  const caseLogContent = readFileSync(caseLogPath, "utf-8");
  const retroContent = readFileSync(retroPath, "utf-8");

  const caseLogSections = splitIntoSections(caseLogContent);
  const retroSections = splitIntoSections(retroContent);

  console.log(`case-log.md: ${caseLogSections.length} sections`);
  console.log(`cc-retro.md: ${retroSections.length} sections`);
  console.log();

  // ── Ingest case-log.md ─────────────────────────────────────────────────────
  console.log("Ingesting case-log.md → ai_memory (domain=cc-learnings) + knowledge_chunks...");
  const caseLogStats = await ingestSections(caseLogSections, {
    domain: "cc-learnings",
    memoryType: "episodic",
    importance: 0.88,
    sourceFile: "case-log",
    orgId: CORE_ORG_ID,
  });

  console.log(`  ai_memory:        ${caseLogStats.aiMemoryInserted} inserted, ${caseLogStats.aiMemorySkipped} skipped (already exists)`);
  console.log(`  knowledge_chunks: ${caseLogStats.knowledgeChunksInserted} inserted, ${caseLogStats.knowledgeChunksSkipped} skipped`);
  console.log(`  federated (high-priority → Tookitaki): ${caseLogStats.federatedInserted} inserted`);
  console.log();

  // ── Ingest cc-retro.md ─────────────────────────────────────────────────────
  console.log("Ingesting cc-retro.md → ai_memory (domain=cc-retro) + knowledge_chunks...");
  const retroStats = await ingestSections(retroSections, {
    domain: "cc-retro",
    memoryType: "episodic",
    importance: 0.82,
    sourceFile: "cc-retro",
    orgId: CORE_ORG_ID,
  });

  console.log(`  ai_memory:        ${retroStats.aiMemoryInserted} inserted, ${retroStats.aiMemorySkipped} skipped (already exists)`);
  console.log(`  knowledge_chunks: ${retroStats.knowledgeChunksInserted} inserted, ${retroStats.knowledgeChunksSkipped} skipped`);
  console.log(`  federated (high-priority → Tookitaki): ${retroStats.federatedInserted} inserted`);
  console.log();

  const totalSections = caseLogSections.length + retroSections.length;
  const totalInserted =
    caseLogStats.aiMemoryInserted + retroStats.aiMemoryInserted +
    caseLogStats.knowledgeChunksInserted + retroStats.knowledgeChunksInserted;

  console.log(`=== Done ===`);
  console.log(`Processed ${totalSections} sections total.`);
  console.log(`Inserted ${totalInserted} new rows (ai_memory + knowledge_chunks combined).`);
  console.log(`Federated ${caseLogStats.federatedInserted + retroStats.federatedInserted} high-priority entries to Tookitaki workspaces.`);

  return { caseLog: caseLogStats, retro: retroStats, totalSections };
}

// ── Run directly if executed as a script ──────────────────────────────────────
// Detect: node/tsx running this file directly (not imported as module)
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  runCCLearningKickstart().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
